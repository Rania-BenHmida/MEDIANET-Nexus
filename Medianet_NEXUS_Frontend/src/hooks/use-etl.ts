import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { etlApi } from "@/lib/api/etl";

const LAST_RUN_KEY = ["etl", "last-run"];
const HISTORY_KEY = ["etl", "history"];

/** Reads the persisted last-run outcome — shown on page load, independent of any in-session refresh. */
export function useEtlLastRun() {
  return useQuery({ queryKey: LAST_RUN_KEY, queryFn: etlApi.lastRun });
}

/** Every run — manual or scheduled — newest first. Used by the Talend page's history list. */
export function useEtlHistory(limit = 20) {
  return useQuery({ queryKey: [...HISTORY_KEY, limit], queryFn: () => etlApi.history(limit) });
}

/**
 * Starts the Data_Master refresh and polls its status every 3s until it
 * finishes. `jobId` is kept in local state (not the query cache) since it's
 * ephemeral UI state scoped to this one button.
 */
export function useTalendRefresh() {
  const [jobId, setJobId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const trigger = useMutation({
    mutationFn: (triggeredBy?: string) => etlApi.triggerRefresh(triggeredBy),
    onSuccess: (data) => setJobId(data.job_id),
  });

  const statusQuery = useQuery({
    queryKey: ["etl", "refresh-status", jobId],
    queryFn: () => etlApi.jobStatus(jobId as string),
    enabled: jobId !== null,
    refetchInterval: (query) => (query.state.data?.status === "running" ? 3000 : false),
  });

  // Once the polled job lands on success/failed, refresh both the
  // persisted "last run" (header timestamp) and the history list, so a
  // manual refresh shows up in the log without a page reload.
  useEffect(() => {
    if (statusQuery.data?.status === "success" || statusQuery.data?.status === "failed") {
      queryClient.invalidateQueries({ queryKey: LAST_RUN_KEY });
      queryClient.invalidateQueries({ queryKey: HISTORY_KEY });
    }
  }, [statusQuery.data?.status, queryClient]);

  const isRunning = trigger.isPending || statusQuery.data?.status === "running";

  return {
    start: (triggeredBy?: string) => trigger.mutate(triggeredBy),
    isRunning,
    status: statusQuery.data,
    reset: () => setJobId(null),
  };
}