// use-customer-profile.ts — add next to use-deals.ts / use-projects.ts

import { useQuery } from "@tanstack/react-query";
import { customersApi } from "@/lib/api";

export const customerProfileKeys = {
  all:    ["customer-profiles"] as const,
  list:   () => [...customerProfileKeys.all, "list"] as const,
  detail: (id: number) => [...customerProfileKeys.all, "detail", id] as const,
};

export function useCustomersList() {
  return useQuery({
    queryKey: customerProfileKeys.list(),
    queryFn:  customersApi.list,
  });
}

export function useCustomerProfile(companyId: number) {
  return useQuery({
    queryKey: customerProfileKeys.detail(companyId),
    queryFn:  () => customersApi.get(companyId),
    enabled:  Number.isFinite(companyId),
  });
}

export const customersB2BStatsKey = ["customers", "b2b", "stats"] as const;
 
export function useCustomersB2BStats() {
  return useQuery({
    queryKey: customersB2BStatsKey,
    queryFn:  customersApi.b2bStats,
  });
}


export const customersB2CStatsKey = ["customers", "b2c", "stats"] as const;

export function useCustomersB2CStats() {
  return useQuery({
    queryKey: customersB2CStatsKey,
    queryFn:  customersApi.b2cStats,
  });
}