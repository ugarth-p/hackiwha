import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { spawn } from 'child_process';
import { join } from 'path';
import { Tenant } from '../database/entities/tenant.entity';
import { ResearchRun, RunStatus } from '../database/entities/research-run.entity';
import { Finding } from '../database/entities/finding.entity';
import { RunPipelineDto } from './research.dto';

@Injectable()
export class ResearchService {
  private readonly logger = new Logger(ResearchService.name);

  constructor(
    @InjectRepository(Tenant) private tenantRepo: Repository<Tenant>,
    @InjectRepository(ResearchRun) private runRepo: Repository<ResearchRun>,
    @InjectRepository(Finding) private findingRepo: Repository<Finding>,
  ) {}

  async runPipeline(dto: RunPipelineDto): Promise<ResearchRun> {
    let tenant = await this.tenantRepo.findOneBy({ id: dto.tenantId });
    if (!tenant) {
      tenant = this.tenantRepo.create({
        id: dto.tenantId,
        businessDescription: dto.businessDescription,
      });
      await this.tenantRepo.save(tenant);
    }

    const run = this.runRepo.create({
      tenantId: dto.tenantId,
      status: RunStatus.RUNNING,
      startedAt: new Date(),
    });
    await this.runRepo.save(run);

    this.spawnWorker(run.id, dto);

    return run;
  }

  async getRun(runId: string): Promise<ResearchRun> {
    return this.runRepo.findOneOrFail({ where: { id: runId } });
  }

  async getFindings(runId: string): Promise<Finding[]> {
    return this.findingRepo.find({ where: { runId } });
  }

  async getFindingsByTenant(tenantId: string): Promise<Finding[]> {
    return this.findingRepo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  private spawnWorker(runId: string, dto: RunPipelineDto): void {
    const workerPath = join(__dirname, '..', '..', '..', 'workers', 'main.py');
    const python = spawn('python3', [workerPath], {
      cwd: join(__dirname, '..', '..', '..', 'workers'),
      env: { ...process.env },
    });

    const input = JSON.stringify({
      tenant_id: dto.tenantId,
      business_description: dto.businessDescription,
      known_competitors: dto.knownCompetitors ?? [],
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
          await this.runRepo.update(runId, {
            status: RunStatus.COMPLETED,
            completedAt: new Date(),
          });
          this.logger.log(`Pipeline run ${runId} completed`);
        } catch {
          await this.runRepo.update(runId, {
            status: RunStatus.FAILED,
            completedAt: new Date(),
          });
          this.logger.error(`Pipeline run ${runId} — failed to parse output`);
        }
      } else {
        await this.runRepo.update(runId, {
          status: RunStatus.FAILED,
          completedAt: new Date(),
        });
        this.logger.error(`Pipeline run ${runId} failed (code ${code}): ${stderr}`);
      }
    });

    python.on('error', async (err) => {
      await this.runRepo.update(runId, {
        status: RunStatus.FAILED,
        completedAt: new Date(),
      });
      this.logger.error(`Pipeline run ${runId} — spawn error: ${err.message}`);
    });
  }
}
