import { IsString, IsArray, IsOptional } from 'class-validator';

export class RunPipelineDto {
  @IsString()
  tenantId!: string;

  @IsString()
  businessDescription!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  knownCompetitors?: string[];
}
