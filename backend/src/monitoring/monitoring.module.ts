import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { MonitoringService } from './monitoring.service';
import { MonitoringController } from './monitoring.controller';

@Module({
  controllers: [MonitoringController],
  providers: [MonitoringService, PrismaService],
  exports: [MonitoringService],
})
export class MonitoringModule {}
