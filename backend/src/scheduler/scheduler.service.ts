import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma.service';
import { MonitoringService } from '../monitoring/monitoring.service';
import { spawn } from 'child_process';
import { join } from 'path';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private prisma: PrismaService,
    private monitoringService: MonitoringService,
  ) {}

  @Cron('0 */15 * * * *')
  async handleScheduledRuns() {
    const now = new Date();

    const dueTenants = await this.prisma.tenant.findMany({
      where: {
        nextRunAt: { lte: now },
      },
    });

    if (dueTenants.length === 0) {
      return;
    }

    this.logger.log(
      `Scheduler found ${dueTenants.length} tenant(s) due for a run`,
    );

    for (const tenant of dueTenants) {
      try {
        const run = await this.createPipelineRun(tenant.id);
        await this.triggerPipelineRun(tenant.id, tenant.businessDescription, run.id);
        await this.markPipelineRunCompleted(run.id);
        this.logger.log(`Completed scheduled run for tenant ${tenant.id}`);
      } catch (err) {
        this.logger.error(
          `Failed to trigger scheduled run for tenant ${tenant.id}: ${err}`,
        );
      }
    }
  }

  @Cron('0 0 */24 * * *')
  async handleMonitoringRuns() {
    const now = new Date();

    const tenants = await this.prisma.tenant.findMany();

    if (tenants.length === 0) {
      return;
    }

    this.logger.log(
      `Monitoring cron found ${tenants.length} tenant(s) to check`,
    );

    for (const tenant of tenants) {
      try {
        const latestRun = await this.prisma.pipelineRun.findFirst({
          where: { tenantId: tenant.id, status: 'completed' },
          orderBy: { completedAt: 'desc' },
        });

        if (!latestRun) {
          this.logger.log(
            `No completed run for tenant ${tenant.id}, skipping monitoring`,
          );
          continue;
        }

        const existingResult =
          await this.prisma.monitoringResult.findFirst({
            where: { tenantId: tenant.id, currentRunId: latestRun.id },
          });

        if (existingResult) {
          this.logger.log(
            `Monitoring already ran for run ${latestRun.id}, skipping`,
          );
          continue;
        }

        await this.monitoringService.runMonitoringForTenant(
          tenant.id,
          latestRun.id,
        );
        this.logger.log(
          `Completed monitoring for tenant ${tenant.id}, run ${latestRun.id}`,
        );
      } catch (err) {
        this.logger.error(
          `Failed monitoring for tenant ${tenant.id}: ${err}`,
        );
      }
    }
  }

  private async createPipelineRun(tenantId: string) {
    return this.prisma.pipelineRun.create({
      data: {
        tenantId,
        status: 'running',
        triggeredBy: 'schedule',
      },
    });
  }

  private async markPipelineRunCompleted(runId: string) {
    await this.prisma.pipelineRun.update({
      where: { id: runId },
      data: { status: 'completed', completedAt: new Date() },
    });
  }

  private triggerPipelineRun(
    tenantId: string,
    businessDescription: string | null,
    runId: string,
  ): Promise<Record<string, any>> {
    return new Promise((resolve, reject) => {
      const workerPath = join(
        __dirname,
        '..',
        '..',
        '..',
        'workers',
        'main.py',
      );
      const python = spawn('python3', [workerPath], {
        cwd: join(__dirname, '..', '..', '..', 'workers'),
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

      python.on('close', async (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(stdout);
            await this.savePipelineSteps(runId, result);
            resolve(result);
          } catch {
            reject(new Error(`Failed to parse pipeline output: ${stdout}`));
          }
        } else {
          reject(new Error(`Worker failed (code ${code}): ${stderr}`));
        }
      });

      python.on('error', reject);
    });
  }

  private async savePipelineSteps(
    runId: string,
    result: Record<string, any>,
  ) {
    const stepEntries: { stepName: string; status: string; outputJson: any; startedAt: Date; completedAt: Date }[] = [];

    for (const [stepName, output] of Object.entries(result)) {
      stepEntries.push({
        stepName,
        status: 'completed',
        outputJson: output,
        startedAt: new Date(),
        completedAt: new Date(),
      });
    }

    if (stepEntries.length > 0) {
      await this.prisma.pipelineStep.createMany({
        data: stepEntries.map((entry) => ({
          runId,
          ...entry,
        })),
      });
    }
  }
}
