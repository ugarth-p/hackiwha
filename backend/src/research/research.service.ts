import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import { join } from 'path';
import { RunPipelineDto } from './research.dto';
import { PrismaService } from '@/modules/prisma/prisma.service';

@Injectable()
export class ResearchService {
  private readonly logger = new Logger(ResearchService.name);

  constructor(private prisma: PrismaService) {}

  async runPipeline(dto: RunPipelineDto) {
    const tenant = await this.prisma.tenant.upsert({
      where: { id: dto.tenantId },
      update: { businessDescription: dto.businessDescription },
      create: {
        id: dto.tenantId,
        name: dto.tenantId,
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
    return this.prisma.finding.findMany({
      where: { tenantId: runId },
    });
  }

  async getFindingsByTenant(tenantId: string) {
    return this.prisma.finding.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  private spawnWorker(runId: string, dto: RunPipelineDto): void {
    const workerPath = join(__dirname, '..', '..', '..', 'workers', 'main.py');
    const python = spawn('python3', [workerPath], {
      cwd: join(__dirname, '..', '..', '..', 'workers'),
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

    python.on('close', async (code) => {
      if (code === 0) {
        try {
          const result = JSON.parse(stdout);
          await this.prisma.pipelineRun.update({
            where: { id: runId },
            data: { status: 'completed', completedAt: new Date() },
          });
          await this.savePipelineSteps(runId, result);
          this.logger.log(`Pipeline run ${runId} completed`);
        } catch {
          await this.prisma.pipelineRun.update({
            where: { id: runId },
            data: { status: 'failed', completedAt: new Date() },
          });
          this.logger.error(`Pipeline run ${runId} — failed to parse output`);
        }
      } else {
        await this.prisma.pipelineRun.update({
          where: { id: runId },
          data: { status: 'failed', completedAt: new Date() },
        });
        this.logger.error(
          `Pipeline run ${runId} failed (code ${code}): ${stderr}`,
        );
      }
    });

    python.on('error', async (err) => {
      await this.prisma.pipelineRun.update({
        where: { id: runId },
        data: { status: 'failed', completedAt: new Date() },
      });
      this.logger.error(`Pipeline run ${runId} — spawn error: ${err.message}`);
    });
  }

  private async savePipelineSteps(runId: string, result: Record<string, any>) {
    const entries = Object.entries(result).map(([stepName, outputJson]) => ({
      runId,
      stepName,
      status: 'completed' as const,
      outputJson,
      startedAt: new Date(),
      completedAt: new Date(),
    }));

    if (entries.length > 0) {
      await this.prisma.pipelineStep.createMany({ data: entries });
    }
  }
}
