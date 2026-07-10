import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ResearchService } from './research.service';
import { ResearchController } from './research.controller';

@Module({
  controllers: [ResearchController],
  providers: [ResearchService, PrismaService],
  exports: [ResearchService],
})
export class ResearchModule {}
