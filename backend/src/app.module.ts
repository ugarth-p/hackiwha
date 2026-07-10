import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { Tenant } from './database/entities/tenant.entity';
import { ResearchRun } from './database/entities/research-run.entity';
import { Finding } from './database/entities/finding.entity';
import { ResearchModule } from './research/research.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities: [Tenant, ResearchRun, Finding],
      synchronize: false,
    }),
    ResearchModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
