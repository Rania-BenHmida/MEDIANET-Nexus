// customers.ts — add next to deals.ts / projects.ts, then re-export from index.ts
// the same way dealsApi / projectsApi are re-exported today.

import { get } from "./client";

export type CustomerListItem = {
  id: number;
  codeCompany: string;
  company: string;
  industry: string | null;
  headquarters: string | null;
  employees: number | null;
  nbSubs: number;
  nbTickets: number;
  nbDeals: number;
  tenureMonths: number | null;
};

export type LoyaltyBreakdown = {
  tenure: number;
  hasUpgraded: number;
  autoRenewShare: number;
  survival: number;
};

export type UpsellBreakdown = {
  autoRenewShare: number;
  hasUpgraded: number;
  noDowngrade: number;
  notAllTrial: number;
  tenure: number;
  relativeUsage: number;
};

export type CustomerHealth = {
  loyaltyScore: number | null;
  upsellReadiness: number | null;
  tier: "Ambassador" | "Established" | "Developing" | "New / At Risk" | "No data";
  segment: "Churned" | "Trial" | "At Risk" | "Upsold" | "Loyal" | "Stable" | "No data";
  loyaltyBreakdown: LoyaltyBreakdown | null;
  upsellBreakdown: UpsellBreakdown | null;
};

export type CustomersB2BStats = {
  totalCompanies: number;
  arrAccumulated: number;
  arrAdded: number;
  arrYear: number;
  churnRate: number;
  fidelityRate: number;
  escalatedTickets: number;
};

export type CustomersB2CStats = {
  totalCustomers: number;
  totalRevenue: number;
  avgCltv: number;
  churnRate: number;
  churnRevenueRate: number;
  atRiskCustomers: number;
};

export type CustomerDeal = {
  id: number;
  value: number | null;
  stage: string | null;
  isClosed: boolean | null;
  isWon: boolean | null;
};

export type CustomerProfile = {
  company: {
    id: number;
    codeCompany: string;
    name: string;
    industry: string | null;
    headquarters: string | null;
    yearEstablished: number | null;
    revenue: number | null;
    employees: number | null;
  };
  subscriptions: {
    count: number;
    activeCount: number;
    tenureMonths: number | null;
    mrr: number;
    arr: number;
  };
  health: CustomerHealth;
  tickets: {
    total: number;
    closed: number;
    avgResolutionHours: number | null;
    escalationRate: number | null;
    avgSatisfaction: number | null;
  };
  deals: {
    count: number;
    items: CustomerDeal[];
  };
  // Both null/[] until the survey agent and the recommendation engine ship —
  // the UI renders these as "coming soon" rather than hiding the section.
  voiceOfCustomer: null;
  recommendedActions: [];
};



export const customersApi = {
  b2bStats: () => get<CustomersB2BStats>("/customers/b2b/stats/"),
  b2cStats: () => get<CustomersB2CStats>("/customers/b2c/stats/"),   // ← add this line
  list:   ()               => get<CustomerListItem[]>("/customers/"),
  get:    (companyId: number) => get<CustomerProfile>(`/customers/${companyId}/`),
};
 