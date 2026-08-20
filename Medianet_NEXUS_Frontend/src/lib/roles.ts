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
  | "surveys"
  | "reports"
  | "ai";

/** Which roles are permitted to view each section. */
export const SECTION_ACCESS: Record<SectionKey, AppRole[]> = {
  // Restricted from its previous broader access (admin, commercial,
  // customer_success, project_manager) — Overview now lives under the
  // Executive sidebar group alongside Reports, so its access matches.
  dashboard: ["executive", "superadmin"],
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
  // Executive Reports — every entity's Power BI report in one view.
  reports: ["executive", "superadmin"],
  // Medianaute (AI assistant) — queries the business data warehouse
  // (deals, customers, projects, churn), so it's open to every role that
  // has visibility into at least one of those sections. it_specialist is
  // the one deliberate exclusion: a pure system-ops role with no business
  // data access anywhere else, so the chatbot would have nothing relevant
  // to answer for them.
  ai: ["admin", "superadmin", "executive", "commercial", "customer_success", "project_manager"],
};

export function canAccess(section: SectionKey, roles: AppRole[]): boolean {
  if (roles.length === 0) return false;
  return roles.some((r) => SECTION_ACCESS[section].includes(r));
}

// Route for each section — used by /unauthorized to find somewhere real to
// send a signed-in user, instead of statically claiming "access denied" no
// matter what their actual roles allow. Two of these (customers, deals)
// are inferred from the same /_authenticated/<module>/list pattern
// confirmed for projects — worth double-checking these two match your
// actual file routes.
const SECTION_ROUTE: Partial<Record<SectionKey, string>> = {
  dashboard: "/dashboard",
  reports: "/reports",
  roles: "/admin",
  talend: "/talend",
  projects: "/projects/list",
  customers: "/customers/list", // inferred — confirm this matches your actual route
  deals: "/deals/list",         // inferred — confirm this matches your actual route
  surveys: "/surveys/contacts",
  ai: "/ai/GenBI",
};

// Checked in this order — cross-cutting/system sections first, so a
// superadmin lands on /dashboard rather than, say, /surveys/contacts.
// "ai" is deliberately left out of this list — it's a cross-cutting tool,
// not a real landing page, and every role that can reach it also has at
// least one of the sections above, so it'll never actually be needed as a
// fallback.
const SECTION_PRIORITY: SectionKey[] = [
  "dashboard", "reports", "roles", "talend", "projects", "customers", "deals", "surveys",
];

/**
 * First route this set of roles can actually reach, or null if truly none
 * (which shouldn't happen today — every AppRole has at least one accessible
 * section — but kept as an honest fallback rather than assuming it can't).
 */
export function getHomeRoute(roles: AppRole[]): string | null {
  for (const section of SECTION_PRIORITY) {
    if (canAccess(section, roles) && SECTION_ROUTE[section]) {
      return SECTION_ROUTE[section]!;
    }
  }
  return null;
}

/**
 * AI Insight sections on the Overview page. Finer-grained than
 * SECTION_ACCESS.customers on purpose — B2C churn (Fact_Churn, consumer
 * accounts) and B2B churn (Fact_Subscription, company accounts) are
 * different datasets that different roles care about, even though both
 * currently sit under the same "customers" section permission.
 */
export type InsightCategory =
  | "revenue_deals"
  | "customer_churn_b2c"
  | "customer_churn_b2b"
  | "projects";

export const INSIGHT_CATEGORY_ORDER: InsightCategory[] = [
  "revenue_deals",
  "customer_churn_b2b",
  "customer_churn_b2c",
  "projects",
];

/** Which roles see each AI insight section on the Overview page.
 * executive/admin/superadmin are cross-cutting and see all four —
 * everyone else only sees the domain(s) that match their actual job. */
export const INSIGHT_ACCESS: Record<InsightCategory, AppRole[]> = {
  revenue_deals: ["admin", "superadmin", "executive", "commercial"],
  customer_churn_b2c: ["admin", "superadmin", "executive", "customer_success"],
  customer_churn_b2b: ["admin", "superadmin", "executive", "customer_success", "commercial"],
  projects: ["admin", "superadmin", "executive", "project_manager"],
};

export function accessibleInsightCategories(roles: AppRole[]): InsightCategory[] {
  if (roles.length === 0) return [];
  return INSIGHT_CATEGORY_ORDER.filter((cat) =>
    roles.some((r) => INSIGHT_ACCESS[cat].includes(r)),
  );
}