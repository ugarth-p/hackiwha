import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/services/api";
import type { RunMonitoringDto, MonitoringResult } from "@/types/api";

export function useTriggerMonitoring() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: RunMonitoringDto) => api.monitoring.trigger(dto),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["monitoring", variables.tenantId],
      });
    },
  });
}

export function useLatestMonitoring(tenantId: string | null) {
  return useQuery({
    queryKey: ["monitoring", tenantId, "latest"],
    queryFn: () => api.monitoring.getLatest(tenantId!),
    enabled: !!tenantId,
  });
}

export function useMonitoringHistory(tenantId: string | null) {
  return useQuery({
    queryKey: ["monitoring", tenantId, "history"],
    queryFn: () => api.monitoring.getHistory(tenantId!),
    enabled: !!tenantId,
  });
}
