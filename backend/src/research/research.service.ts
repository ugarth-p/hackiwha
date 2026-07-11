import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import { join } from 'path';
import { Subject } from 'rxjs';
import { RunPipelineDto } from './research.dto';
import { PrismaService } from '@/modules/prisma/prisma.service';

export interface PipelineEvent {
  type: 'step_started' | 'step_completed' | 'run_completed' | 'run_failed';
  runId: string;
  stepName?: string;
  output?: unknown;
  error?: string;
}

@Injectable()
export class ResearchService {
  private readonly logger = new Logger(ResearchService.name);
  private readonly pipelineEvents$ = new Subject<PipelineEvent>();

  constructor(private prisma: PrismaService) {}

  getRunEvents(runId: string) {
    return this.pipelineEvents$.asObservable();
  }

  async runPipeline(dto: RunPipelineDto) {
    const tenant = await this.prisma.tenant.upsert({
      where: { id: dto.tenantId },
      update: { businessDescription: dto.businessDescription },
      create: {
        id: dto.tenantId,
        name: dto.name ?? dto.tenantId,
        businessDescription: dto.businessDescription,
      },
    });

    const run = await this.prisma.pipelineRun.create({
      data: {
        tenantId: tenant.id,
        status: 'running',
        triggeredBy: 'manual',
      },
    });

    this.spawnWorker(run.id, dto);

    return run;
  }

  async getRun(runId: string) {
    return this.prisma.pipelineRun.findUniqueOrThrow({
      where: { id: runId },
      include: { steps: true },
    });
  }

  async getFindings(runId: string) {
    const run = await this.prisma.pipelineRun.findUnique({
      where: { id: runId },
    });
    if (!run) return [];
    return this.prisma.finding.findMany({
      where: { tenantId: run.tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getFindingsByTenant(tenantId: string) {
    return this.prisma.finding.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  private spawnWorker(runId: string, dto: RunPipelineDto): void {
    const workersDir = join(__dirname, '..', '..', '..', 'workers');
    const workerPath = join(workersDir, 'main.py');
    const pythonBin = 'python3';
    const python = spawn(pythonBin, [workerPath], {
      cwd: workersDir,
      env: { ...process.env },
    });

    const input = JSON.stringify({
      mode: 'pipeline',
      tenant_id: dto.tenantId,
      business_description: dto.businessDescription,
      known_competitors: dto.knownCompetitors ?? [],
      run_id: runId,
    });

    python.stdin.write(input);
    python.stdin.end();

    let lineBuffer = '';
    let stderr = '';

    python.stdout.on('data', (data: Buffer) => {
      lineBuffer += data.toString();
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        this.handleWorkerLine(runId, trimmed).catch((err) =>
          this.logger.error(`Pipeline run ${runId} — error handling line: ${err}`),
        );
      }
    });

    python.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    python.on('close', (code) => {
      const handleClose = async () => {
        if (lineBuffer.trim()) {
          await this.handleWorkerLine(runId, lineBuffer.trim());
        }
        if (code === 0) {
          await this.prisma.pipelineRun.update({
            where: { id: runId },
            data: { status: 'completed', completedAt: new Date() },
          });
          this.pipelineEvents$.next({
            type: 'run_completed',
            runId,
          });
          this.logger.log(`Pipeline run ${runId} completed`);
        } else {
          await this.prisma.pipelineRun.update({
            where: { id: runId },
            data: { status: 'failed', completedAt: new Date() },
          });
          this.pipelineEvents$.next({
            type: 'run_failed',
            runId,
            error: stderr,
          });
          this.logger.error(
            `Pipeline run ${runId} failed (code ${code}): ${stderr}`,
          );
        }
      };
      void handleClose();
    });

    python.on('error', (err) => {
      const handleError = async () => {
        await this.prisma.pipelineRun.update({
          where: { id: runId },
          data: { status: 'failed', completedAt: new Date() },
        });
        this.pipelineEvents$.next({
          type: 'run_failed',
          runId,
          error: err.message,
        });
        this.logger.error(
          `Pipeline run ${runId} — spawn error: ${err.message}`,
        );
      };
      void handleError();
    });
  }

  private async handleWorkerLine(runId: string, line: string): Promise<void> {
    try {
      const msg = JSON.parse(line) as {
        step: string;
        output: Record<string, unknown>;
      };
      await this.prisma.pipelineStep.create({
        data: {
          runId,
          stepName: msg.step,
          status: 'completed',
          outputJson: msg.output as object,
          startedAt: new Date(),
          completedAt: new Date(),
        },
      });
      this.pipelineEvents$.next({
        type: 'step_completed',
        runId,
        stepName: msg.step,
        output: msg.output,
      });
    } catch (err) {
      this.logger.warn(`Pipeline run ${runId} — could not parse worker line: ${line}`);
    }
  }
}
