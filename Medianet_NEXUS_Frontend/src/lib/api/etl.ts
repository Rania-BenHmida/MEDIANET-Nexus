import { get, post } from "./client";

export type EtlJobStatus = {
  job_id: string;
  status: "running" | "success" | "failed";
  returncode: number | null;
  output: string;
  started_at: string;
  finished_at: string | null;
};

export type TriggerRefreshResponse = {
  job_id: string;
  status: "running" | "success" | "failed";
  already_running: boolean;
};

// Same shape as EtlJobStatus, but job_id/status can be null when no run
// has ever completed (e.g. brand new environment, file never written).
export type EtlLastRun = {
  job_id: string | null;
  status: "running" | "success" | "failed" | null;
  returncode?: number | null;
  output?: string;
  started_at?: string;
  finished_at?: string | null;
};

export type EtlHistoryEntry = {
  job_id: string;
  trigger_type: "manual" | "scheduled";
  triggered_by: string;
  status: "running" | "success" | "failed";
  returncode: number | null;
  started_at: string | null;
  finished_at: string | null;
};

export type EtlHistoryResponse = {
  results: EtlHistoryEntry[];
};

export const etlApi = {
  // triggeredBy: display name/email of whoever's logged in on the
  // frontend — Django has no auth of its own, so this is passed in and
  // stored on the EtlRunLog row for the history list. Scheduled runs never
  // pass this, so they show up with an empty triggered_by.
  triggerRefresh: (triggeredBy?: string) =>
    post<TriggerRefreshResponse>("/talend/refresh/", { triggered_by: triggeredBy ?? "" }),
  jobStatus: (jobId: string) => get<EtlJobStatus>(`/talend/refresh/${jobId}/status/`),
  lastRun: () => get<EtlLastRun>("/talend/last-run/"),
  history: (limit = 20) => get<EtlHistoryResponse>(`/talend/history/?limit=${limit}`),
};