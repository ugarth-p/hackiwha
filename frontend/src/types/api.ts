export interface Tenant {
  id: string;
  name: string;
  businessDescription: string | null;
  nextRunAt: string | null;
  createdAt: string;
}

export interface PipelineRun {
  id: string;
  tenantId: string;
  status: "running" | "completed" | "failed";
  triggeredBy: string;
  startedAt: string;
  completedAt: string | null;
  steps?: PipelineStep[];
}

export interface PipelineStep {
  id: string;
  runId: string;
  stepName: string;
  status: "pending" | "running" | "completed" | "failed";
  inputJson: unknown | null;
  outputJson: unknown | null;
  errorText: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

export interface Finding {
  id: string;
  tenantId: string;
  source: string;
  content: string;
  createdAt: string;
}

export interface MonitoringResult {
  id: string;
  tenantId: string;
  currentRunId: string;
  previousRunId: string | null;
  significantChangeDetected: boolean;
  changes: unknown;
  alertMessage: string | null;
  conceptForValidation: string | null;
  createdAt: string;
}

export interface MarketIntelOutput {
  industry_summary: string;
  market_trends: string[];
  typical_pricing_models: string[];
  common_customer_pain_points: string[];
  sources: string[];
}

export interface CompetitorOutput {
  name: string;
  pricing_notes: string;
  positioning: string;
  recent_activity: string[];
  review_sentiment_summary: string;
  sources: string[];
}

export interface CompetitorReconOutput {
  competitors: CompetitorOutput[];
}

export interface StrategyOutput {
  positioning: string;
  messaging: string;
  pricing_recommendation: string;
  recommended_actions: string[];
}

export interface PipelineResult {
  market_intelligence?: MarketIntelOutput;
  competitor_recon?: CompetitorReconOutput;
  strategy_output?: StrategyOutput;
}

export interface RunPipelineDto {
  tenantId: string;
  businessDescription: string;
  name?: string;
  knownCompetitors?: string[];
}

export interface RunMonitoringDto {
  tenantId: string;
  currentRunId: string;
}

export interface PipelineEvent {
  type: "step_started" | "step_completed" | "run_completed" | "run_failed";
  runId: string;
  stepName?: string;
  output?: unknown;
  error?: string;
}

export type StageName = "market_intelligence" | "competitor_recon" | "strategy_output";

export const STAGE_TO_STEP: Record<string, StageName> = {
  research: "market_intelligence",
  logic: "competitor_recon",
  synthesis: "strategy_output",
};
