import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaService } from '../prisma.service';
import { SchedulerService } from './scheduler.service';
import { MonitoringModule } from '../monitoring/monitoring.module';

@Module({
  imports: [ScheduleModule.forRoot(), MonitoringModule],
  providers: [SchedulerService, PrismaService],
  exports: [SchedulerService],
})
export class SchedulerModule {}
