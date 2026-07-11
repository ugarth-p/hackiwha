import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import { join } from 'path';
import { Subject, filter } from 'rxjs';
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
    return this.pipelineEvents$.pipe(filter((event) => event.runId === runId));
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

    let stdout = '';
    let stderr = '';

    python.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    python.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    python.on('close', (code) => {
      const handleClose = async () => {
        if (code === 0) {
          try {
            const result = JSON.parse(stdout) as Record<string, unknown>;
            await this.prisma.pipelineRun.update({
              where: { id: runId },
              data: { status: 'completed', completedAt: new Date() },
            });
            await this.savePipelineSteps(runId, result);
            this.pipelineEvents$.next({
              type: 'run_completed',
              runId,
            });
            this.logger.log(`Pipeline run ${runId} completed`);
          } catch {
            await this.prisma.pipelineRun.update({
              where: { id: runId },
              data: { status: 'failed', completedAt: new Date() },
            });
            this.pipelineEvents$.next({
              type: 'run_failed',
              runId,
              error: 'Failed to parse worker output',
            });
            this.logger.error(`Pipeline run ${runId} — failed to parse output`);
          }
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

  private async savePipelineSteps(
    runId: string,
    result: Record<string, unknown>,
  ) {
    const entries = Object.entries(result).map(([stepName, outputJson]) => ({
      runId,
      stepName,
      status: 'completed' as const,
      outputJson: outputJson as object,
      startedAt: new Date(),
      completedAt: new Date(),
    }));

    if (entries.length > 0) {
      await this.prisma.pipelineStep.createMany({ data: entries });
    }

    for (const [stepName, output] of Object.entries(result)) {
      this.pipelineEvents$.next({
        type: 'step_completed',
        runId,
        stepName,
        output,
      });
    }
  }
}
