export type AppRole =
  | "admin"
  | "superadmin"
  | "it_specialist"
  | "executive"
  | "commercial"
  | "customer_success"
  | "project_manager";

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Administrator",
  superadmin: "Super Admin",
  it_specialist: "IT Specialist",
  executive: "Executive",
  commercial: "Commercial Manager",
  customer_success: "Customer Success Manager",
  project_manager: "Project Manager",
};

export type SectionKey =
  | "dashboard"
  | "projects"
  | "customers"
  | "deals"
  | "roles"
  | "talend"
  | "surveys";

/** Which roles are permitted to view each section. */
export const SECTION_ACCESS: Record<SectionKey, AppRole[]> = {
  dashboard: ["admin", "superadmin", "executive", "commercial", "customer_success", "project_manager"],
  projects: ["admin", "superadmin", "project_manager"],
  customers: ["admin", "superadmin", "customer_success", "commercial"],
  deals: ["admin", "superadmin", "commercial"],
  // Role assignment — deliberately excludes plain "admin".
  roles: ["superadmin", "it_specialist"],
  // Talend master-job refresh control — same tier as role assignment.
  talend: ["superadmin", "it_specialist"],
  // Survey agent — Customer Success Manager's own tool. superadmin keeps
  // access as the union role (business + system controls); everyone else,
  // including plain admin, is deliberately excluded.
  surveys: ["superadmin", "customer_success"],
};

export function canAccess(section: SectionKey, roles: AppRole[]): boolean {
  if (roles.length === 0) return false;
  return roles.some((r) => SECTION_ACCESS[section].includes(r));
}