import { get, post, patch, del } from "./client";

export type DealsStats = {
  pipelineValue: number;
  openDeals: number;
  avgCustomerLifetimeValue: number;
  winRate: number;
  uniqueClients: number;
  avgSalesCycleDays: number | null;
  pipelineValueChange: number;
  winRateChange: number;
};

/**
 * Warehouse deal — returned by list/get, sourced from
 * Fact_Opportunity joined with all four dimension tables.
 * `id` is the integer ID_Opportunity surrogate key.
 */
export type Deal = {
  id: number;
  agent_name: string | null;
  plan_name: string | null;
  company_name: string | null;
  stage_name: string | null;
  is_closed: boolean | null;
  is_won: boolean | null;
  stage_group: "Open" | "Closed" | null;
  engage_date: string | null;   // ISO 'YYYY-MM-DD', parsed from the ID_Engage_Date date-key
  close_date: string | null;    // ISO 'YYYY-MM-DD', parsed from the ID_Close_Date date-key (nullable)
  close_value: number | null;
};

/**
 * Pending deal — staging row in SA_Pipeline, awaiting a Talend load
 * into the warehouse. `id` is the short DB-assigned code (e.g. '00017AO').
 */
export type PendingDeal = {
  id: string;
  agent_name: string;
  plan_name: string;
  company_name: string;
  stage_name: string;
  engage_date: string;
  close_date?: string | null;
  close_value?: number | null;
  status: string;
  created_at: string;
};

export type NewDeal = {
  agent_name: string;
  plan_name: string;
  company_name: string;
  stage_name: string;
  engage_date: string;
  close_date?: string | null;
  close_value?: number | null;
};

export type DealFilters = {
  stage_name?: string;
  agent_name?: string;
  company_name?: string;
  plan_name?: string;
  is_closed?: boolean;
  is_won?: boolean;
  stage_group?: "Open" | "Closed";
};

function buildQuery(filters?: DealFilters): string {
  if (!filters) return "";
  const params = new URLSearchParams();
  if (filters.stage_name)   params.set("stage_name",   filters.stage_name);
  if (filters.agent_name)   params.set("agent_name",   filters.agent_name);
  if (filters.company_name) params.set("company_name", filters.company_name);
  if (filters.plan_name)    params.set("plan_name",    filters.plan_name);
  if (filters.is_closed !== undefined) params.set("is_closed", String(filters.is_closed));
  if (filters.is_won    !== undefined) params.set("is_won",    String(filters.is_won));
  if (filters.stage_group)  params.set("stage_group",  filters.stage_group);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export const dealsApi = {
  // Stats card
  stats: () => get<DealsStats>("/deals/stats/"),

  // Warehouse — read-only
  list:       (filters?: DealFilters) => get<Deal[]>(`/deals/${buildQuery(filters)}`),
  listOpen:   (filters?: DealFilters) => get<Deal[]>(`/deals/open/${buildQuery(filters)}`),
  listClosed: (filters?: DealFilters) => get<Deal[]>(`/deals/closed/${buildQuery(filters)}`),
  get:        (id: number)            => get<Deal>(`/deals/${id}/`),

  // Staging — pending deals (create / edit / safe delete)
  create:        (data: NewDeal)                      => post<{ success: boolean; id: string }>("/deals/create/", data),
  updatePending: (id: string, data: Partial<NewDeal>)  => patch<PendingDeal>(`/deals/pending/${id}/`, data),
  removePending: (id: string)                          => del<void>(`/deals/pending/${id}/delete/`),

  // Warehouse — Closed deals: narrow edit (close_value / close_date only)
  updateClosed: (id: number, data: { close_value?: number | null; close_date?: string | null }) =>
    patch<Deal>(`/deals/${id}/close-correction/`, data),

  // Warehouse — Open deals: edit stage / close_value / close_date
  updateOpen: (id: number, data: { stage_name?: string; close_value?: number | null; close_date?: string | null }) =>
    patch<Deal>(`/deals/${id}/open-correction/`, data),

  // Warehouse — Open deals only: destructive hard delete (no undo)
  removeHistorical: (id: number) => del<void>(`/deals/${id}/delete/`),
};