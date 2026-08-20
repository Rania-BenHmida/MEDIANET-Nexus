import { get, post } from "./client";
import type { InsightCategory } from "../roles";

export type InsightTone = "primary" | "warning" | "destructive";

export type InsightItem = {
  tone: InsightTone;
  title: string;
  body: string;
};

export type InsightStatus = "ready" | "failed" | "empty";

export type CategoryInsights = {
  category: InsightCategory;
  status: InsightStatus;
  items: InsightItem[];
  modelUsed: string;
  errorMessage: string;
  generatedAt: string | null;
};

export const insightsApi = {
  /** Cached read only — never triggers generation. */
  list: (categories: InsightCategory[]) =>
    get<CategoryInsights[]>(`/insights/?categories=${categories.join(",")}`),

  /** Synchronous regeneration — can take 10-30s (several grounded Gen BI
   * questions + one synthesis call). Overwrites the cached row in place. */
  refresh: (category: InsightCategory) =>
    post<CategoryInsights>(`/insights/${category}/refresh/`, {}),
};