import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class RunMonitoringDto {
  @IsString()
  tenantId: string;

  @IsString()
  currentRunId: string;

  @IsOptional()
  @IsBoolean()
  approved?: boolean = true;

  @IsOptional()
  @IsString()
  feedback?: string;
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
