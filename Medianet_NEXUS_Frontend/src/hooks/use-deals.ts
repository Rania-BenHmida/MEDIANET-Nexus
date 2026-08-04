import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { dealsApi, type NewDeal, type DealFilters } from "@/lib/api";

// ── Query keys ────────────────────────────────────────────────────────────────

export const dealKeys = {
  all:        ["deals"]                                          as const,
  lists:      ()              => [...dealKeys.all, "list"]       as const,
  list:       (f?: DealFilters) => [...dealKeys.lists(), "all", f]    as const,
  openList:   (f?: DealFilters) => [...dealKeys.lists(), "open", f]   as const,
  closedList: (f?: DealFilters) => [...dealKeys.lists(), "closed", f] as const,
  stats:      ["deals", "stats"]                                 as const,
  detail:     (id: number) => [...dealKeys.all, "detail", id]    as const,
};

// ── Queries ───────────────────────────────────────────────────────────────────

export function useDealsStats() {
  return useQuery({
    queryKey: dealKeys.stats,
    queryFn:  dealsApi.stats,
  });
}

/** All deals, regardless of Stage_Group. */
export function useDeals(filters?: DealFilters) {
  return useQuery({
    queryKey: dealKeys.list(filters),
    queryFn:  () => dealsApi.list(filters),
  });
}

/** Deals where Dim_Stage.Stage_Group = 'Open' (Prospecting, Engaging, Qualification…). */
export function useOpenDeals(filters?: Omit<DealFilters, "stage_group">) {
  return useQuery({
    queryKey: dealKeys.openList(filters),
    queryFn:  () => dealsApi.listOpen(filters),
  });
}

/** Deals where Dim_Stage.Stage_Group = 'Closed' (Won, Lost). */
export function useClosedDeals(filters?: Omit<DealFilters, "stage_group">) {
  return useQuery({
    queryKey: dealKeys.closedList(filters),
    queryFn:  () => dealsApi.listClosed(filters),
  });
}

/** Single warehouse deal by integer ID_Opportunity. */
export function useDeal(id: number) {
  return useQuery({
    queryKey: dealKeys.detail(id),
    queryFn:  () => dealsApi.get(id),
    enabled:  Number.isFinite(id),
  });
}

// ── Mutations ─────────────────────────────────────────────────────────────────

function invalidateAllDealLists(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: dealKeys.lists() });
  queryClient.invalidateQueries({ queryKey: dealKeys.stats });
}

/** Create a new pending deal in the staging queue (SA_Pipeline). */
export function useCreateDeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: NewDeal) => dealsApi.create(data),
    onSuccess: () => invalidateAllDealLists(queryClient),
  });
}

/** Edit a pending (not-yet-loaded) deal. id = staging code, e.g. '00017AO'. */
export function useUpdatePendingDeal(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<NewDeal>) => dealsApi.updatePending(id, data),
    onSuccess: () => invalidateAllDealLists(queryClient),
  });
}

/** Safe delete — removes a pending deal from the staging queue. */
export function useDeletePendingDeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => dealsApi.removePending(id),
    onSuccess: () => invalidateAllDealLists(queryClient),
  });
}

/**
 * Edit a Closed (Won/Lost) warehouse deal — only close_value/close_date.
 * Backend rejects this on Open deals.
 */
export function useUpdateClosedDeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: number; data: { close_value?: number | null; close_date?: string | null } }) =>
      dealsApi.updateClosed(vars.id, vars.data),
    onSuccess: () => invalidateAllDealLists(queryClient),
  });
}

/**
 * Edit an Open warehouse deal — stage, close_value, close_date.
 * Backend rejects this on Closed deals (use useUpdateClosedDeal there).
 */
export function useUpdateOpenDeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: number; data: { stage_name?: string; close_value?: number | null; close_date?: string | null } }) =>
      dealsApi.updateOpen(vars.id, vars.data),
    onSuccess: () => invalidateAllDealLists(queryClient),
  });
}

/**
 * ⚠️ Destructive hard delete — permanently removes a row from
 * Fact_Opportunity. No undo, affects historical stats/reporting.
 * Only ever exposed for OPEN deals in the UI.
 * id = warehouse integer ID_Opportunity.
 */
export function useDeleteHistoricalDeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => dealsApi.removeHistorical(id),
    onSuccess: () => invalidateAllDealLists(queryClient),
  });
}