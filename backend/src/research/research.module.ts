import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from '../database/entities/tenant.entity';
import { ResearchRun } from '../database/entities/research-run.entity';
import { Finding } from '../database/entities/finding.entity';
import { ResearchService } from './research.service';
import { ResearchController } from './research.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant, ResearchRun, Finding])],
  controllers: [ResearchController],
  providers: [ResearchService],
})
export class ResearchModule {}
