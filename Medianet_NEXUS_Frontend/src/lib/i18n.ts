import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const en = {
  common: {
    live: "Live",
    askAi: "Ask AI",
    searchPlaceholder: "Search dashboards, customers, deals…",
    signOut: "Sign out",
    settings: "Settings",
    account: "Account",
    noRole: "No role",
    loading: "Loading…",
    language: "Language",
  },
  nav: {
  businessUnits: "Business Units",
  system: "System",
  intelligence: "Intelligence",
  aiAssistant: "AI Assistant",
  overview: "Overview",
  projects: "Project Tracking",
  customers: "Customer Analytics",
  deals: "Deals & Lifetime",
  roles: "Role Management",   // was: admin
  talend: "Data Refresh",     // new
  executive: "Executive",
  },
  dashboard: {
    eyebrow: "Executive Overview",
    greeting: "Good day, {{name}}.",
    description: "Real-time intelligence across projects, customers, and revenue.",
    kpi: {
      totalRevenue: "Total Revenue",
      activeDeals: "Active Deals",
      activeProjects: "Active Projects",
      churnRisk: "Overall Churn Risk",
      totalAccounts: "Total Accounts",
    },
    insights: {
      title: "AI Insights",
      refresh: "Refresh",
      refreshing: "Refreshing…",
      generate: "Generate insights",
      generating: "Generating insights — this can take up to 30s…",
      empty: "No insights generated yet.",
      failed: "Insight generation failed.",
      lastUpdated: "Updated {{time}}",
      tones: {
        primary: "Highlight",
        warning: "Warning",
        destructive: "Critical",
      },
      categories: {
        revenue_deals: {
          label: "Revenue & Deals",
          description: "Pipeline, win rate, and subscription revenue trends.",
        },
        customer_churn_b2c: {
          label: "B2C Customers & Churn",
          description: "Consumer churn drivers, satisfaction, and lifetime value.",
        },
        customer_churn_b2b: {
          label: "B2B Customers & Churn",
          description: "Company account churn, support health, and renewal risk.",
        },
        projects: {
          label: "Projects",
          description: "Task completion, overdue work, and project throughput.",
        },
      },
    },
  },
  projects: {
  eyebrow: "Operations",
  title: "Project & Task Tracking",
  description: "Live operational visibility — milestones, throughput, delays.",
    kpi: {
      active: "Active Projects",
      completed: "Completed",
      productivity: "Team Productivity",
      duration: "Avg. Duration",
      tasksPerProject: "Tasks / Project",
    },
  },
  customers: {
    eyebrow: "Operations",
    title: "B2B & B2C Customer Analytics",
    description: "Engagement, support, retention — across every customer segment.",
    tabs: {
      b2b: "B2B",
      b2c: "B2C",
    },
    kpi: {
      // B2B
      companies: "Total Companies",
      arr: "ARR",
      churnRate: "Churn Rate",
      fidelity: "Fidelity Rate",
      escalatedTickets: "Escalated Tickets",
      // B2C
      totalCustomers: "Total Customers",
      totalRevenue: "Total Revenue",
      avgCltv: "Avg. CLTV",
      churnRevenueRate: "Churned Revenue Rate",
      atRisk: "At-Risk Customers",
    },
  },
  deals: {
    eyebrow: "Operations",
    title: "Deals & Customer Lifetime Tracking",
    description: "Pipeline, conversion, and revenue across the customer lifecycle.",
    kpi: {
      pipeline: "Deals Revenue",
      open: "On going Deals",
      clv: "Avg. CLV (B2B)",
      winRate: "Win Rate",
      salesCycle: "Avg. Sales Cycle",
      uniqueClients: "Partners",
    },
  },
  admin: {
    eyebrow: "System",
    title: "Administration",
    description: "Manage users and role-based access across the platform.",
    user: "User",
    roles: "Roles",
    noUsers: "No users yet.",
    footnote: "Role assignment is enforced server-side via row-level policies. To grant or revoke roles, update the user_roles table.",
  },
  talend: {
  eyebrow: "System",
  title: "Data Refresh",
  description: "Keep your dashboards up to date with the latest information.",
  body: "Pulls the latest company, project, and customer data into MEDIANET NEXUS. Usually takes a few minutes to finish.",
  refreshButton: "Refresh now",
  refreshing: "Refreshing…",
  refreshSuccess: "Data refresh completed successfully.",
  refreshFailed: "Data refresh failed — contact IT if this keeps happening.",
  lastRun: "Last refresh",
  lastRunNever: "never run yet",
  },
  settings: {
    eyebrow: "System",
    title: "Settings",
    description: "Your account and access.",
    displayName: "Display name",
    email: "Email",
    roles: "Roles",
    noRole: "No role assigned",
    language: "Language",
    languageDesc: "Choose your preferred interface language.",
  },
  ai: {
    title: "Medianaute",
    tagline: "Your AI analyst for customers, deals & projects.",
    greetingWithName: "Hello {{name}}.",
    greeting: "Hello.",
    intro: "I'm Medianaute. I can analyze customers, deals, and projects across your dashboards. Ask me anything below — or pick a starter prompt.",
    suggested: "Suggested prompts",
    placeholder: "Ask intelligence…",
    pending: "Connecting to your data warehouse… Once a generative model is wired up, I'll respond with grounded insights from your Power BI datasets.",
    error: "I don't have that information yet — but I can help with customer health, deals, and project status. Try asking about one of those.",
    you: "You",
    retry: "Retry",
    s1: "Which customers are most likely to churn?",
    s2: "Show me the sales trend through the years.",
    s3: "Show me delayed projects.",
    s4: "Which deals have the highest winning probability?",
    s5: "Summarize this quarter's performance.",
  },
};

const fr: typeof en = {
  common: {
    live: "En direct",
    askAi: "Demander à l'IA",
    searchPlaceholder: "Rechercher tableaux de bord, clients, affaires…",
    signOut: "Déconnexion",
    settings: "Paramètres",
    account: "Compte",
    noRole: "Aucun rôle",
    loading: "Chargement…",
    language: "Langue",
  },
  nav: {
    businessUnits: "Unités métier",
    system: "Système",
    intelligence: "Intelligence",
    aiAssistant: "Assistant IA",
    overview: "Vue d'ensemble",
    projects: "Suivi des projets",
    customers: "Analytique clients",
    deals: "Affaires & cycle de vie",
    roles: "Gestion des rôles",
    talend: "Actualisation des données",
    executive: "Exécutif",
  },
  dashboard: {
    eyebrow: "Vue exécutive",
    greeting: "Bonjour, {{name}}.",
    description: "Intelligence en temps réel sur les projets, clients et revenus.",
    kpi: {
      totalRevenue: "Revenu total",
      activeDeals: "Affaires actives",
      activeProjects: "Projets actifs",
      churnRisk: "Risque d'attrition global",
      totalAccounts: "Comptes totaux",
    },
    insights: {
      title: "Insights IA",
      refresh: "Actualiser",
      refreshing: "Actualisation…",
      generate: "Générer les insights",
      generating: "Génération en cours — jusqu'à 30s…",
      empty: "Aucun insight généré pour l'instant.",
      failed: "Échec de la génération des insights.",
      lastUpdated: "Mis à jour {{time}}",
      tones: {
        primary: "À retenir",
        warning: "Avertissement",
        destructive: "Critique",
      },
      categories: {
        revenue_deals: {
          label: "Revenu & Affaires",
          description: "Pipeline, taux de réussite et tendances de revenu d'abonnement.",
        },
        customer_churn_b2c: {
          label: "Clients B2C & Attrition",
          description: "Facteurs d'attrition, satisfaction et valeur vie client.",
        },
        customer_churn_b2b: {
          label: "Clients B2B & Attrition",
          description: "Attrition des comptes entreprise, santé du support et risque de renouvellement.",
        },
        projects: {
          label: "Projets",
          description: "Taux de complétion, retards et débit des projets.",
        },
      },
    },
  },
  projects: {
  eyebrow: "Opérations",
  title: "Suivi des projets & tâches",
  description: "Visibilité opérationnelle en direct — jalons, débit, retards.",
    kpi: {
      active: "Projets actifs",
      completed: "Terminés",
      productivity: "Productivité de l'équipe",
      duration: "Durée moy.",
      tasksPerProject: "Tâches / Projet",
    },
  },
  customers: {
    eyebrow: "Opérations",
    title: "Analytique clients B2B & B2C",
    description: "Engagement, support, rétention — sur tous les segments clients.",
    tabs: {
      b2b: "B2B",
      b2c: "B2C",
    },
    kpi: {
      // B2B
      companies: "Entreprises totales",
      arr: "RAA",
      churnRate: "Taux d'attrition",
      fidelity: "Taux de fidélité",
      escalatedTickets: "Tickets escaladés",
      // B2C
      totalCustomers: "Clients totaux",
      totalRevenue: "Revenu total",
      avgCltv: "VVC moy.",
      churnRevenueRate: "Taux d'attrition (revenu)",
      atRisk: "Clients à risque",
    },
  },
  deals: {
    eyebrow: "Opérations",
    title: "Affaires & suivi du cycle de vie client",
    description: "Pipeline, conversion et revenu sur le cycle de vie client.",
    kpi: {
      pipeline: "Valeur du pipeline",
      open: "Affaires ouvertes",
      clv: "CLV moy. (B2B)",
      winRate: "Taux de réussite",
      salesCycle: "Cycle de vente moy.",
      uniqueClients: "Partenaires",
    },
  },
  admin: {
    eyebrow: "Système",
    title: "Administration",
    description: "Gérer les utilisateurs et les accès par rôle sur la plateforme.",
    user: "Utilisateur",
    roles: "Rôles",
    noUsers: "Aucun utilisateur pour le moment.",
    footnote: "L'attribution des rôles est appliquée côté serveur via des politiques RLS. Pour accorder ou révoquer un rôle, modifiez la table user_roles.",
  },
  talend: {
  eyebrow: "Système",
  title: "Actualisation des données",
  description: "Gardez vos tableaux de bord à jour avec les dernières informations.",
  body: "Récupère les dernières données clients, projets et entreprises dans MEDIANET NEXUS. Prend généralement quelques minutes.",
  refreshButton: "Actualiser maintenant",
  refreshing: "Actualisation…",
  refreshSuccess: "L'actualisation des données s'est terminée avec succès.",
  refreshFailed: "L'actualisation a échoué — contactez l'IT si cela persiste.",
  lastRun: "Dernière actualisation",
  lastRunNever: "jamais exécutée",
  },
  settings: {
    eyebrow: "Système",
    title: "Paramètres",
    description: "Votre compte et vos accès.",
    displayName: "Nom affiché",
    email: "E-mail",
    roles: "Rôles",
    noRole: "Aucun rôle attribué",
    language: "Langue",
    languageDesc: "Choisissez votre langue d'interface préférée.",
  },
  ai: {
    title: "Medianaute",
    tagline: "Votre analyste IA pour clients, affaires et projets.",
    greetingWithName: "Bonjour {{name}}.",
    greeting: "Bonjour.",
    intro: "Je suis Medianaute. Je peux analyser clients, affaires et projets sur vos tableaux de bord. Posez-moi une question — ou choisissez une suggestion.",
    suggested: "Suggestions",
    placeholder: "Interroger l'intelligence…",
    pending: "Connexion à votre entrepôt de données… Une fois un modèle génératif branché, je répondrai avec des insights ancrés sur vos jeux de données Power BI.",
    error: "Je n'ai pas encore cette information — mais je peux vous aider sur la santé client, les affaires ou l'état des projets. Essayez de me poser une question sur l'un de ces sujets.",
    you: "Vous",
    retry: "Réessayer",
    s1: "Quels clients risquent le plus d'attrition ce trimestre ?",
    s2: "Pourquoi les ventes ont-elles baissé ce mois-ci ?",
    s3: "Montre-moi les projets en retard.",
    s4: "Quelles affaires ont la plus forte probabilité de clôture ?",
    s5: "Résume la performance de ce trimestre.",
  },
};

const stored = typeof window !== "undefined" ? window.localStorage.getItem("lang") : null;

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    fr: { translation: fr },
  },
  lng: stored ?? "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export const SUPPORTED_LANGS = [
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
] as const;

export function setLanguage(lng: string) {
  void i18n.changeLanguage(lng);
  if (typeof window !== "undefined") {
    window.localStorage.setItem("lang", lng);
    document.documentElement.lang = lng;
  }
}

export default i18n;