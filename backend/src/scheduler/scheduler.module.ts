import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { SchedulerService } from './scheduler.service';
import { MonitoringModule } from '../monitoring/monitoring.module';

@Module({
  imports: [MonitoringModule],
  providers: [SchedulerService, PrismaService],
  exports: [SchedulerService],
})
export class SchedulerModule {}
