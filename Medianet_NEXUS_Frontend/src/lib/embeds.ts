export type EmbedReport = {
  id: string;
  title: string;
  description?: string;
  /** Power BI embed URL. Leave empty string to render a placeholder. */
  embedUrl: string;
};

export type EmbedSection = "projects" | "customersB2B" | "customersB2C" | "deals";

export const EMBEDS: Record<EmbedSection, EmbedReport[]> = {

  projects: [
    {
      id: "project-progress",
      title: "Project Progress & Milestones",
      description: "Live status of active projects, tasks, and deadlines.",
      embedUrl: "https://app.powerbi.com/reportEmbed?reportId=c00acb93-7c0c-42ee-a091-a1fe375558fe&autoAuth=true&ctid=604f1a96-cbe8-43f8-abbf-f8eaf5d85730",
    },
  ],
  customersB2B: [
    {
      id: "customer-360",
      title: "Customer 360°",
      description: "B2B activity, Loyalty, and Upselling.",
      embedUrl: "https://app.powerbi.com/reportEmbed?reportId=9680906d-2ae0-4c58-8709-2c42e5ce6084&autoAuth=true&ctid=604f1a96-cbe8-43f8-abbf-f8eaf5d85730",
    },
  ],
  customersB2C: [
    {
      id: "churn",
      title: "Churn Analytics",
      description: "Churn risk and retention cohorts.",
      embedUrl: "https://app.powerbi.com/reportEmbed?reportId=1be04aef-434d-4fbe-8972-256075378937&autoAuth=true&ctid=604f1a96-cbe8-43f8-abbf-f8eaf5d85730",
    },
  ],
  deals: [
    {
      id: "pipeline",
      title: "Deal Pipeline",
      description: "Active deals by stage and probability.",
      embedUrl: "https://app.powerbi.com/reportEmbed?reportId=6c7ba3f3-7901-470e-b21c-b31557c81e87&autoAuth=true&ctid=604f1a96-cbe8-43f8-abbf-f8eaf5d85730",
    },
  ],
};