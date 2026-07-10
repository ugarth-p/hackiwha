import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { ResearchRun } from './research-run.entity';
import { Finding } from './finding.entity';

@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  businessDescription: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @OneToMany(() => ResearchRun, (run) => run.tenant)
  runs: ResearchRun[];

  @OneToMany(() => Finding, (finding) => finding.tenant)
  findings: Finding[];
}
