import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { MonitoringModule } from '../monitoring/monitoring.module';

@Module({
  imports: [MonitoringModule],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}
