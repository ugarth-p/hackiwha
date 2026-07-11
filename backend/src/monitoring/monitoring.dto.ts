import { IsString } from 'class-validator';

export class RunMonitoringDto {
  @IsString()
  tenantId!: string;

  @IsString()
  currentRunId!: string;
}
