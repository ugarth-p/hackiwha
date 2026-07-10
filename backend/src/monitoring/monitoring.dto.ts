import { IsString, IsOptional } from 'class-validator';

export class RunMonitoringDto {
  @IsString()
  tenantId: string;

  @IsString()
  currentRunId: string;
}

export class MonitoringResultResponseDto {
  id: string;
  tenantId: string;
  currentRunId: string;
  previousRunId: string | null;
  significantChangeDetected: boolean;
  changes: string[];
  alertMessage: string | null;
  conceptForValidation: string | null;
  createdAt: Date;
}
