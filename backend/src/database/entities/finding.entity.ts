import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Tenant } from './tenant.entity';
import { ResearchRun } from './research-run.entity';

export enum AgentType {
  MARKET_INTEL = 'market_intel',
  COMPETITOR_RECON = 'competitor_recon',
}

@Entity('findings')
export class Finding {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'run_id', type: 'uuid' })
  runId: string;

  @Column({ name: 'agent_type', type: 'enum', enum: AgentType })
  agentType: AgentType;

  @Column({ type: 'jsonb' })
  content: Record<string, any>;

  @Column({ type: 'varchar', nullable: true })
  embedding: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => Tenant, (tenant) => tenant.findings)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @ManyToOne(() => ResearchRun)
  @JoinColumn({ name: 'run_id' })
  run: ResearchRun;
}
