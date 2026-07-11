import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import { join } from 'path';
import { RunMonitoringDto } from './monitoring.dto';
import { PrismaService } from '@/modules/prisma/prisma.service';

interface MonitoringWorkerResult {
  significant_change_detected: boolean;
  changes: string[];
  alert_message: string | null;
  concept_for_validation: string;
}

@Injectable()
export class MonitoringService {
  private readonly logger = new Logger(MonitoringService.name);

  constructor(private prisma: PrismaService) {}

  async runMonitoring(dto: RunMonitoringDto) {
    const currentRun = await this.prisma.pipelineRun.findUniqueOrThrow({
      where: { id: dto.currentRunId },
      include: { steps: true },
    });

    if (currentRun.status !== 'completed') {
      throw new Error('Run must be completed before monitoring');
    }

    const previousRun = await this.prisma.pipelineRun.findFirst({
      where: {
        tenantId: dto.tenantId,
        status: 'completed',
        id: { not: dto.currentRunId },
      },
      orderBy: { completedAt: 'desc' },
      include: { steps: true },
    });

    const currentData = this.extractStepOutputs(currentRun.steps);
    const previousData = previousRun
      ? this.extractStepOutputs(previousRun.steps)
      : null;

    const result = await this.spawnMonitoringWorker({
      tenant_id: dto.tenantId,
      current_run_id: dto.currentRunId,
      previous_run_id: previousRun?.id ?? null,
      current_run_data: currentData,
      previous_run_data: previousData,
    });

    const saved = await this.prisma.monitoringResult.create({
      data: {
        tenantId: dto.tenantId,
        currentRunId: dto.currentRunId,
        previousRunId: previousRun?.id ?? null,
        significantChangeDetected: result.significant_change_detected,
        changes: result.changes,
        alertMessage: result.alert_message,
        conceptForValidation: result.concept_for_validation,
      },
    });

    const intervalMs = parseInt(
      process.env.MONITORING_INTERVAL_MS || String(24 * 60 * 60 * 1000),
    );
    await this.prisma.tenant.update({
      where: { id: dto.tenantId },
      data: { nextRunAt: new Date(Date.now() + intervalMs) },
    });

    return saved;
  }

  async runMonitoringForTenant(tenantId: string, currentRunId: string) {
    return this.runMonitoring({ tenantId, currentRunId });
  }

  async getLatestResult(tenantId: string) {
    return this.prisma.monitoringResult.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getResultHistory(tenantId: string) {
    return this.prisma.monitoringResult.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  private extractStepOutputs(
    steps: { stepName: string; outputJson: unknown }[],
  ): Record<string, unknown> {
    const outputs: Record<string, unknown> = {};
    for (const step of steps) {
      if (step.outputJson) {
        outputs[step.stepName] = step.outputJson;
      }
    }
    return outputs;
  }

  private spawnMonitoringWorker(
    inputData: Record<string, unknown>,
  ): Promise<MonitoringWorkerResult> {
    return new Promise((resolve, reject) => {
      const workersDir = join(__dirname, '..', '..', '..', 'workers');
      const workerPath = join(workersDir, 'main.py');
      const pythonBin = 'python3';
      const python = spawn(pythonBin, [workerPath], {
        cwd: workersDir,
        env: { ...process.env },
      });

      const payload = JSON.stringify({ mode: 'monitoring', ...inputData });
      python.stdin.write(payload);
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
            resolve(JSON.parse(stdout) as MonitoringWorkerResult);
          } catch {
            this.logger.error(`Failed to parse monitoring output: ${stdout}`);
            reject(new Error(`Failed to parse monitoring output: ${stdout}`));
          }
        } else {
          this.logger.error(
            `Monitoring worker failed (code ${code}): ${stderr}`,
          );
          reject(
            new Error(`Monitoring worker failed (code ${code}): ${stderr}`),
          );
        }
      });

      python.on('error', (err) => {
        this.logger.error(`Monitoring worker spawn error: ${err.message}`);
        reject(err);
      });
    });
  }
}
