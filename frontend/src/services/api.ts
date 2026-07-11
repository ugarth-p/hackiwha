import type {
  PipelineRun,
  Finding,
  MonitoringResult,
  RunPipelineDto,
  RunMonitoringDto,
} from "@/types/api";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json();
}

export const api = {
  research: {
    triggerPipeline(dto: RunPipelineDto): Promise<{ runId: string; status: string }> {
      return request("/api/research/pipeline", {
        method: "POST",
        body: JSON.stringify(dto),
      });
    },

    getRun(runId: string): Promise<PipelineRun> {
      return request(`/api/research/runs/${runId}`);
    },

    getRunFindings(runId: string): Promise<Finding[]> {
      return request(`/api/research/runs/${runId}/findings`);
    },

    getTenantFindings(tenantId: string): Promise<Finding[]> {
      return request(`/api/research/tenants/${tenantId}/findings`);
    },

    streamRun(runId: string): EventSource {
      const base = BASE_URL || "";
      return new EventSource(`${base}/api/research/runs/${runId}/stream`);
    },
  },

  monitoring: {
    trigger(dto: RunMonitoringDto): Promise<MonitoringResult> {
      return request("/api/monitoring/run", {
        method: "POST",
        body: JSON.stringify(dto),
      });
    },

    getLatest(tenantId: string): Promise<MonitoringResult | null> {
      return request(`/api/monitoring/tenant/${tenantId}`);
    },

    getHistory(tenantId: string): Promise<MonitoringResult[]> {
      return request(`/api/monitoring/tenant/${tenantId}/history`);
    },
  },

  tenants: {
    getFindings(tenantId: string): Promise<Finding[]> {
      return request(`/api/research/tenants/${tenantId}/findings`);
    },
  },
};
