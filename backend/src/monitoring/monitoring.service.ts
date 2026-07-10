import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { spawn } from 'child_process';
import { join } from 'path';
import { RunMonitoringDto } from './monitoring.dto';

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

    let suggestions = null;
    if (dto.approved === false) {
      suggestions = await this.spawnSuggestionsWorker(
        currentData.strategy_output ?? {},
        dto.feedback ?? '',
      );
    }

    const intervalMs = parseInt(
      process.env.MONITORING_INTERVAL_MS || String(24 * 60 * 60 * 1000),
    );
    await this.prisma.tenant.update({
      where: { id: dto.tenantId },
      data: { nextRunAt: new Date(Date.now() + intervalMs) },
    });

    return { ...saved, suggestions };
  }

  async runMonitoringForTenant(tenantId: string, currentRunId: string) {
    return this.runMonitoring({ tenantId, currentRunId });
  }

  async getPreview(tenantId: string, runId: string) {
    const run = await this.prisma.pipelineRun.findUniqueOrThrow({
      where: { id: runId },
      include: { steps: true },
    });

    if (run.tenantId !== tenantId) {
      throw new Error('Run does not belong to this tenant');
    }

    const strategyStep = run.steps.find(s => s.stepName === 'strategy_output');
    const strategyOutput = strategyStep?.outputJson ?? {};

    return { tenantId, runId, strategyOutput };
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
    steps: { stepName: string; outputJson: any }[],
  ): Record<string, any> {
    const outputs: Record<string, any> = {};
    for (const step of steps) {
      if (step.outputJson) {
        outputs[step.stepName] = step.outputJson;
      }
    }
    return outputs;
  }

  private spawnSuggestionsWorker(
    strategyOutput: Record<string, any>,
    feedback: string,
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const workerPath = join(__dirname, '..', '..', '..', 'workers', 'main.py');
      const python = spawn('python3', [workerPath], {
        cwd: join(__dirname, '..', '..', '..', 'workers'),
        env: { ...process.env },
      });

      const payload = JSON.stringify({
        mode: 'suggestions',
        strategy_output: strategyOutput,
        feedback,
      });
      python.stdin.write(payload);
      python.stdin.end();

      let stdout = '';
      let stderr = '';

      python.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
      python.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

      python.on('close', (code) => {
        if (code === 0) {
          try { resolve(JSON.parse(stdout)); }
          catch { reject(new Error(`Failed to parse suggestions output: ${stdout}`)); }
        } else {
          reject(new Error(`Suggestions worker failed (code ${code}): ${stderr}`));
        }
      });

      python.on('error', reject);
    });
  }

  private spawnMonitoringWorker(inputData: Record<string, any>): Promise<any> {
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
            resolve(JSON.parse(stdout));
          } catch {
            reject(new Error(`Failed to parse monitoring output: ${stdout}`));
          }
        } else {
          reject(
            new Error(`Monitoring worker failed (code ${code}): ${stderr}`),
          );
        }
      });

      python.on('error', reject);
    });
  }
}
