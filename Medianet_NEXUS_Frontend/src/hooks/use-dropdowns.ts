import { useQuery } from "@tanstack/react-query";
import { dropdownsApi } from "@/lib/api";

const STALE = 5 * 60 * 1000; // 5 min — dropdown lists don't change often

export function useCompanies() {
  return useQuery({ queryKey: ["dropdowns", "companies"], queryFn: dropdownsApi.companies, staleTime: STALE });
}
export function usePlans() {
  return useQuery({ queryKey: ["dropdowns", "plans"], queryFn: dropdownsApi.plans, staleTime: STALE });
}
export function useAgents() {
  return useQuery({ queryKey: ["dropdowns", "agents"], queryFn: dropdownsApi.agents, staleTime: STALE });
}
export function useStages() {
  return useQuery({ queryKey: ["dropdowns", "stages"], queryFn: dropdownsApi.stages, staleTime: STALE });
}
// Used inside the Add Company popover
export function useCompanyIndustries() {
  return useQuery({ queryKey: ["dropdowns", "companyIndustries"], queryFn: dropdownsApi.companyIndustries, staleTime: STALE });
}
export function useCompanyHeadquarters() {
  return useQuery({ queryKey: ["dropdowns", "companyHeadquarters"], queryFn: dropdownsApi.companyHeadquarters, staleTime: STALE });
}
// Used inside the Add Agent popover
export function useAgentManagers() {
  return useQuery({ queryKey: ["dropdowns", "agentManagers"], queryFn: dropdownsApi.agentManagers, staleTime: STALE });
}
export function useAgentOffices() {
  return useQuery({ queryKey: ["dropdowns", "agentOffices"], queryFn: dropdownsApi.agentOffices, staleTime: STALE });
}
export function useEmployees(q?: string) {
  // Per-term cache key so each distinct search caches independently. The
  // empty-string key holds the default (first 50) list. keepPreviousData
  // keeps the old results visible while the next query loads, so the
  // dropdown doesn't flash empty between keystrokes.
  const term = (q ?? "").trim();
  return useQuery({
    queryKey: ["dropdowns", "employees", term],
    queryFn:  () => dropdownsApi.employees(term || undefined),
    staleTime: STALE,
    placeholderData: (prev) => prev,
  });
}
export function useAllCompanies() {
  return useQuery({ queryKey: ["dropdowns", "companiesAll"], queryFn: dropdownsApi.companiesAll, staleTime: STALE });
}
export function useTags() {
  return useQuery({ queryKey: ["dropdowns", "tags"], queryFn: dropdownsApi.tags, staleTime: STALE });
}
export function useSections() {
  return useQuery({ queryKey: ["dropdowns", "sections"], queryFn: dropdownsApi.sections, staleTime: STALE });
}
export function useProjectTeams() {
  return useQuery({ queryKey: ["dropdowns", "projectTeams"], queryFn: dropdownsApi.projectTeams, staleTime: STALE });
}
export function useEmployeeTeams() {
  return useQuery({ queryKey: ["dropdowns", "employeeTeams"], queryFn: dropdownsApi.employeeTeams, staleTime: STALE });
}