import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Sse,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { ResearchService } from './research.service';
import { RunPipelineDto } from './research.dto';

@Controller('api/research')
export class ResearchController {
  constructor(private readonly researchService: ResearchService) {}

  @Post('pipeline')
  @HttpCode(HttpStatus.ACCEPTED)
  async runPipeline(@Body() dto: RunPipelineDto) {
    const run = await this.researchService.runPipeline(dto);
    return { runId: run.id, status: run.status };
  }

  @Get('runs/:runId')
  async getRun(@Param('runId') runId: string) {
    return this.researchService.getRun(runId);
  }

  @Get('runs/:runId/findings')
  async getRunFindings(@Param('runId') runId: string) {
    return this.researchService.getFindings(runId);
  }

  @Get('tenants/:tenantId/findings')
  async getTenantFindings(@Param('tenantId') tenantId: string) {
    return this.researchService.getFindingsByTenant(tenantId);
  }

  @Sse('runs/:runId/stream')
  streamRun(@Param('runId') runId: string): Observable<any> {
    return this.researchService.getRunEvents(runId).pipe(
      map((event) => ({
        data: event,
        id: `${Date.now()}`,
      })),
    );
  }
}
