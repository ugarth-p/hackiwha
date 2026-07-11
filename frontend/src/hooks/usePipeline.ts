import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useEffect } from "react";
import { api } from "@/services/api";
import type { RunPipelineDto, PipelineEvent } from "@/types/api";

export function useTriggerPipeline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: RunPipelineDto) => api.research.triggerPipeline(dto),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["runs"] });
      queryClient.invalidateQueries({ queryKey: ["tenants", variables.tenantId] });
    },
  });
}

export function useRun(runId: string | null) {
  return useQuery({
    queryKey: ["runs", runId],
    queryFn: () => api.research.getRun(runId!),
    enabled: !!runId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "running") return 2000;
      return false;
    },
  });
}

export function useRunFindings(runId: string | null) {
  return useQuery({
    queryKey: ["runs", runId, "findings"],
    queryFn: () => api.research.getRunFindings(runId!),
    enabled: !!runId,
  });
}

export function useTenantFindings(tenantId: string | null) {
  return useQuery({
    queryKey: ["tenants", tenantId, "findings"],
    queryFn: () => api.research.getTenantFindings(tenantId!),
    enabled: !!tenantId,
  });
}

export function usePipelineStream(
  runId: string | null,
  onEvent: (event: PipelineEvent) => void,
) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!runId) return;
    const es = api.research.streamRun(runId);
    es.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data) as PipelineEvent;
        onEventRef.current(event);
      } catch { /* ignore parse errors */ }
    };
    es.onerror = () => {
      // Let EventSource auto-reconnect instead of closing
      console.warn("SSE connection error, will reconnect...");
    };
    return () => es.close();
  }, [runId]);
}
