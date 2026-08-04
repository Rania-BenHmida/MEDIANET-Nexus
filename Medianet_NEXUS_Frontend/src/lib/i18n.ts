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
  },
  dashboard: {
    eyebrow: "Executive Overview",
    greeting: "Good day, {{name}}.",
    description: "Real-time intelligence across projects, customers, and revenue.",
    kpi: {
      totalRevenue: "Total Revenue",
      activeDeals: "Active Deals",
      stable: "Stable",
      churnRisk: "Churn Risk",
      high: "High",
      projectHealth: "Project Health",
      onTrack: "On track",
    },
    insights: {
      title: "AI Insights",
      revenueTitle: "Revenue acceleration in Enterprise tier",
      revenueBody: "B2B retention is 14% above projection. Consider expanding APAC capacity.",
      migrationTitle: "Infrastructure Migration is delayed",
      migrationBody: "4 critical tasks stalled — resource mismatch in cloud team.",
      dachTitle: "DACH B2C retention dropped",
      dachBody: "Likely tied to a localized payment latency issue.",
    },
  },
  projects: {
    eyebrow: "Operations",
    title: "Project & Task Tracking",
    description: "Live operational visibility — milestones, throughput, delays.",
    kpi: {
      active: "Active Projects",
      onSchedule: "On Schedule",
      atRisk: "At Risk",
      delayed: "Delayed",
    },
  },
  customers: {
    eyebrow: "Operations",
    title: "B2B & B2C Customer Analytics",
    description: "Engagement, support, retention — across every customer segment.",
    kpi: {
      total: "Total Customers",
      retention: "Retention 90d",
      tickets: "Open Tickets",
      churn: "Churn Risk",
      high: "High",
    },
  },
  deals: {
    eyebrow: "Operations",
    title: "Deals & Customer Lifetime Tracking",
    description: "Pipeline, conversion, and revenue across the customer lifecycle.",
    kpi: {
      pipeline: "Closed Deals Revenue",
      open: "On going Deals",
      clv: "Avg. CLV (B2B)",
      winRate: "Win Rate",
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
  description: "Trigger the Talend master ETL job to refresh the data warehouse.",
  body: "This refreshes Dim_Company and all dependent fact tables from source. Running it may take several minutes.",
  refreshButton: "Refresh now",
  refreshing: "Refreshing…",
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
    title: "Medianet AI",
    greetingWithName: "Hello {{name}}.",
    greeting: "Hello.",
    intro: "I'm Medianet AI. I can analyze customers, deals, and projects across your dashboards. Ask me anything below — or pick a starter prompt.",
    suggested: "Suggested prompts",
    placeholder: "Ask intelligence…",
    pending: "Connecting to your data warehouse… Once a generative model is wired up, I'll respond with grounded insights from your Power BI datasets.",
    error: "Something went wrong. Please try again.",  // ← ADDED
    s1: "Which customers are most likely to churn this quarter?",
    s2: "Why did sales decrease this month?",
    s3: "Show me delayed projects.",
    s4: "Which deals have the highest closing probability?",
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
  },
  dashboard: {
    eyebrow: "Vue exécutive",
    greeting: "Bonjour, {{name}}.",
    description: "Intelligence en temps réel sur les projets, clients et revenus.",
    kpi: {
      totalRevenue: "Revenu total",
      activeDeals: "Affaires actives",
      stable: "Stable",
      churnRisk: "Risque d'attrition",
      high: "Élevé",
      projectHealth: "Santé des projets",
      onTrack: "Sur la bonne voie",
    },
    insights: {
      title: "Insights IA",
      revenueTitle: "Accélération du revenu dans l'offre Entreprise",
      revenueBody: "La rétention B2B dépasse de 14% les prévisions. Envisagez d'étendre la capacité APAC.",
      migrationTitle: "Migration d'infrastructure en retard",
      migrationBody: "4 tâches critiques bloquées — déséquilibre des ressources cloud.",
      dachTitle: "Baisse de rétention B2C en zone DACH",
      dachBody: "Probablement lié à un problème localisé de latence de paiement.",
    },
  },
  projects: {
    eyebrow: "Opérations",
    title: "Suivi des projets & tâches",
    description: "Visibilité opérationnelle en direct — jalons, débit, retards.",
    kpi: {
      active: "Projets actifs",
      onSchedule: "Dans les temps",
      atRisk: "À risque",
      delayed: "En retard",
    },
  },
  customers: {
    eyebrow: "Opérations",
    title: "Analytique clients B2B & B2C",
    description: "Engagement, support, rétention — sur tous les segments clients.",
    kpi: {
      total: "Clients totaux",
      retention: "Rétention 90j",
      tickets: "Tickets ouverts",
      churn: "Risque d'attrition",
      high: "Élevé",
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
  description: "Déclencher le job ETL Talend principal pour actualiser l'entrepôt de données.",
  body: "Ceci actualise Dim_Company et toutes les tables de faits dépendantes depuis la source. L'opération peut prendre plusieurs minutes.",
  refreshButton: "Actualiser maintenant",
  refreshing: "Actualisation…",
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
    title: "Medianet IA",
    greetingWithName: "Bonjour {{name}}.",
    greeting: "Bonjour.",
    intro: "Je suis Medianet IA. Je peux analyser clients, affaires et projets sur vos tableaux de bord. Posez-moi une question — ou choisissez une suggestion.",
    suggested: "Suggestions",
    placeholder: "Interroger l'intelligence…",
    pending: "Connexion à votre entrepôt de données… Une fois un modèle génératif branché, je répondrai avec des insights ancrés sur vos jeux de données Power BI.",
    error: "Une erreur s'est produite. Veuillez réessayer.",  // ← ADDED
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