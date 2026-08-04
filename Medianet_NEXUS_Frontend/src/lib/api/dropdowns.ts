import { get, post } from "./client";

export type Company = { id: number; name: string };

export type Section = { code: string; name: string };

export type NewAgent = {
  full_name: string;
  manager: string;
  regional_office: string;
};

export type NewCompany = {
  company_name: string;
  industry?: string;
  headquarters?: string;
  year_established?: number;
  revenue?: number;
  employees?: number;
};

export type NewStage = {
  stage_name: string;
  stage_group: "Open" | "Closed";
};

export const dropdownsApi = {
  // GETs
  companies:            () => get<Company[]>("/dropdowns/companies/"),
  companyIndustries:    () => get<string[]>("/dropdowns/companies/industries/"),
  companyHeadquarters:  () => get<string[]>("/dropdowns/companies/headquarters/"),
  plans:                () => get<string[]>("/dropdowns/plans/"),
  agents:               () => get<string[]>("/dropdowns/agents/"),
  stages:               () => get<string[]>("/dropdowns/stages/"),
  agentManagers:        () => get<string[]>("/dropdowns/agents/managers/"),
  agentOffices:         () => get<string[]>("/dropdowns/agents/offices/"),
  employees:    (q?: string) => get<Employee[]>(`/dropdowns/employees/${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  companiesAll: () => get<Company[]>("/dropdowns/companies/all/"),
  tags:    () => get<Tag[]>("/dropdowns/tags/"),
  sections: () => get<Section[]>("/dropdowns/sections/"),
  projectTeams: () => get<string[]>("/dropdowns/teams/"),
  employeeTeams: () => get<string[]>("/dropdowns/employees/teams/"),


  // POSTs
  addAgent:   (data: NewAgent)   => post<{ Agent_FullName: string }>("/dropdowns/agents/", data),
  addCompany: (data: NewCompany) => post<{ id: number; name: string }>("/dropdowns/companies/", data),
  addStage:   (data: NewStage)   => post<{ Stage_Name: string }>("/dropdowns/stages/", data),
  addEmployee: (data: NewEmployee) => post<{ id: number; Employee_Code: string; full_name: string }>("/dropdowns/employees/", data),
  addTag:  (data: NewTag) => post<{ id: number; name: string; color: string }>("/dropdowns/tags/", data),
  addSection: (name: string) => post<Section>("/dropdowns/sections/", { name }),

};

export type Employee = { id: number; name: string; role?: string | null };

export type NewEmployee = {
  full_name: string;
  role?: string;
  email?: string;
  team?: string;
};

export type Tag = { id: number; name: string; color: string | null };
export type NewTag = { name: string; color?: string };