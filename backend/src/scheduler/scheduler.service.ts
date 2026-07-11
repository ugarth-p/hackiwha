import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MonitoringService } from '../monitoring/monitoring.service';
import { spawn } from 'child_process';
import { join } from 'path';
import { PrismaService } from '@/modules/prisma/prisma.service';

@Injectable()
export class SchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private prisma: PrismaService,
    private monitoringService: MonitoringService,
  ) {}

  onModuleInit() {
    setInterval(
      () => {
        void this.handleScheduledRuns();
      },
      15 * 60 * 1000,
    );
    setInterval(
      () => {
        void this.handleMonitoringRuns();
      },
      24 * 60 * 60 * 1000,
    );
  }

  async handleScheduledRuns() {
    const now = new Date();

    const dueTenants = await this.prisma.tenant.findMany({
      where: { nextRunAt: { lte: now } },
    });

    if (dueTenants.length === 0) return;

    this.logger.log(
      `Scheduler found ${dueTenants.length} tenant(s) due for a run`,
    );

    for (const tenant of dueTenants) {
      try {
        const run = await this.prisma.pipelineRun.create({
          data: {
            tenantId: tenant.id,
            status: 'running',
            triggeredBy: 'schedule',
          },
        });

        const result = await this.triggerPipelineRun(
          tenant.id,
          tenant.businessDescription,
          run.id,
        );

        await this.prisma.pipelineRun.update({
          where: { id: run.id },
          data: { status: 'completed', completedAt: new Date() },
        });

        await this.savePipelineSteps(run.id, result);
        this.logger.log(`Completed scheduled run for tenant ${tenant.id}`);
      } catch (err) {
        this.logger.error(
          `Failed scheduled run for tenant ${tenant.id}: ${err}`,
        );
      }
    }
  }

  async handleMonitoringRuns() {
    const tenants = await this.prisma.tenant.findMany();

    if (tenants.length === 0) return;

    this.logger.log(`Monitoring cron: checking ${tenants.length} tenant(s)`);

    for (const tenant of tenants) {
      try {
        const latestRun = await this.prisma.pipelineRun.findFirst({
          where: { tenantId: tenant.id, status: 'completed' },
          orderBy: { completedAt: 'desc' },
        });

        if (!latestRun) continue;

        const existing = await this.prisma.monitoringResult.findFirst({
          where: { tenantId: tenant.id, currentRunId: latestRun.id },
        });

        if (existing) continue;

        await this.monitoringService.runMonitoringForTenant(
          tenant.id,
          latestRun.id,
        );
        this.logger.log(
          `Monitoring complete for tenant ${tenant.id}, run ${latestRun.id}`,
        );
      } catch (err) {
        this.logger.error(`Monitoring failed for tenant ${tenant.id}: ${err}`);
      }
    }
  }

  private triggerPipelineRun(
    tenantId: string,
    businessDescription: string | null,
    runId: string,
  ): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const workersDir = join(__dirname, '..', '..', '..', 'workers');
      const workerPath = join(workersDir, 'main.py');
      const pythonBin = 'python3';
      const python = spawn(pythonBin, [workerPath], {
        cwd: workersDir,
        env: { ...process.env },
      });

      const input = JSON.stringify({
        mode: 'pipeline',
        tenant_id: tenantId,
        business_description: businessDescription || '',
        known_competitors: [],
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
        if (code === 0) {
          try {
            resolve(JSON.parse(stdout) as Record<string, unknown>);
          } catch {
            this.logger.error(`Failed to parse pipeline output: ${stdout}`);
            reject(new Error(`Failed to parse pipeline output: ${stdout}`));
          }
        } else {
          this.logger.error(`Pipeline worker failed (code ${code}): ${stderr}`);
          reject(new Error(`Worker failed (code ${code}): ${stderr}`));
        }
      });

      python.on('error', (err) => {
        this.logger.error(`Pipeline worker spawn error: ${err.message}`);
        reject(err);
      });
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
  }
}
