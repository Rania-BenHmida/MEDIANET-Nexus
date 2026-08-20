import { useQuery } from "@tanstack/react-query";
import { dashboardApi } from "@/lib/api/dashboard";

export const dashboardStatsKey = ["dashboard", "stats"] as const;

export function useDashboardStats() {
  return useQuery({
    queryKey: dashboardStatsKey,
    queryFn:  dashboardApi.stats,
  });
}