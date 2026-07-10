import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { MonitoringService } from './monitoring.service';
import { RunMonitoringDto } from './monitoring.dto';

@Controller('api/monitoring')
export class MonitoringController {
  constructor(private readonly monitoringService: MonitoringService) {}

  @Post('run')
  @HttpCode(HttpStatus.ACCEPTED)
  async runMonitoring(@Body() dto: RunMonitoringDto) {
    return this.monitoringService.runMonitoring(dto);
  }

  @Get('tenant/:tenantId')
  async getLatestResult(@Param('tenantId') tenantId: string) {
    return this.monitoringService.getLatestResult(tenantId);
  }

  @Get('tenant/:tenantId/history')
  async getResultHistory(@Param('tenantId') tenantId: string) {
    return this.monitoringService.getResultHistory(tenantId);
  }

  @Get('preview/:tenantId/:runId')
  async getPreview(
    @Param('tenantId') tenantId: string,
    @Param('runId') runId: string,
  ) {
    return this.monitoringService.getPreview(tenantId, runId);
  }
}
