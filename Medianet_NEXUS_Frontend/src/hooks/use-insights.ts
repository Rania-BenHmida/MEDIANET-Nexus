import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { insightsApi } from "@/lib/api/insights";
import type { InsightCategory } from "@/lib/roles";

export const insightKeys = {
  all:  ["insights"] as const,
  list: (categories: InsightCategory[]) => [...insightKeys.all, "list", categories] as const,
};

/** Cached read — fetches whichever categories the current user's role can
 * see. Pass an empty array (e.g. while roles are still loading) to skip
 * the request entirely. */
export function useInsights(categories: InsightCategory[]) {
  return useQuery({
    queryKey: insightKeys.list(categories),
    queryFn:  () => insightsApi.list(categories),
    enabled:  categories.length > 0,
  });
}

/** Regenerates one category. Takes 10-30s — the caller should show a
 * per-section loading state keyed off `isPending`, not a global spinner. */
export function useRefreshInsight(categories: InsightCategory[]) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (category: InsightCategory) => insightsApi.refresh(category),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: insightKeys.list(categories) });
    },
  });
}