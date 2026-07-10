import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma.service';
import { MonitoringModule } from './monitoring/monitoring.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { ResearchModule } from './research/research.module';

@Module({
  imports: [MonitoringModule, SchedulerModule, ResearchModule],
  controllers: [AppController],
  providers: [AppService, PrismaService],
})
export class AppModule {}
