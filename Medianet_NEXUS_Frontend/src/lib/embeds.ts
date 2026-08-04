
export type EmbedReport = {
  id: string;
  title: string;
  description?: string;
  /** Power BI embed URL. Leave empty string to render a placeholder. */
  embedUrl: string;
};

export type EmbedSection = "projects" | "customers" | "deals" ;

export const EMBEDS: Record<EmbedSection, EmbedReport[]> = {
  
  projects: [
    {
      id: "project-progress",
      title: "Project Progress & Milestones",
      description: "Live status of active projects, tasks, and deadlines.",
      embedUrl: "https://app.powerbi.com/reportEmbed?reportId=99ee2b0e-663b-43a1-8368-f9140e08d669&autoAuth=true&ctid=604f1a96-cbe8-43f8-abbf-f8eaf5d85730",
    },
    
  ],
  customers: [
    {
      id: "customer-360",
      title: "Customer 360°",
      description: "B2B & B2C activity, Loyalty, and Upselling.",
      embedUrl: "https://app.powerbi.com/reportEmbed?reportId=b3c9d338-cc52-4c80-88a6-f00942942867&autoAuth=true&ctid=604f1a96-cbe8-43f8-abbf-f8eaf5d85730",
    },
    {
      id: "churn",
      title: "Churn Analytics",
      description: "Churn risk and retention cohorts.",
      embedUrl: "https://app.powerbi.com/reportEmbed?reportId=b523e49b-5619-4aae-bcb4-e5b4dc462362&autoAuth=true&ctid=604f1a96-cbe8-43f8-abbf-f8eaf5d85730",
    },
  ],
  deals: [
    {
      id: "pipeline",
      title: "Deal Pipeline",
      description: "Active deals by stage and probability.",
      embedUrl: "https://app.powerbi.com/reportEmbed?reportId=61d51029-8803-4b92-a0e1-7b94858397ad&autoAuth=true&ctid=604f1a96-cbe8-43f8-abbf-f8eaf5d85730",
    },
  ],
};
