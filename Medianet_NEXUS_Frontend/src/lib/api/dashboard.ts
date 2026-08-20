// dashboard.ts — add next to deals.ts / projects.ts, then add
// `export * from "./dashboard";` to lib/api/index.ts (same barrel pattern
// as every other api module).

import { get } from "./client";

export type DashboardStats = {
  totalRevenue: number;
  activeDeals: number;
  activeProjects: number;
  overallChurnRate: number;
  totalAccounts: number;
};

export const dashboardApi = {
  stats: () => get<DashboardStats>("/dashboard/stats/"),
};