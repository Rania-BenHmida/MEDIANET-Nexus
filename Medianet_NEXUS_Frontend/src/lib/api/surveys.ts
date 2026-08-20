// surveys.ts — add next to customers.ts / deals.ts, then re-export surveysApi
// from wherever customersApi / dealsApi are barrel-exported today.

import { get, post, patch, del, API_BASE } from "./client";

export type QuestionType =
  | "rating_5"
  | "rating_10"
  | "nps"
  | "multiple_choice"
  | "multi_select"
  | "yes_no"
  | "open_text";

export type ScoringDimension = "satisfaction" | "loyalty" | "upsell_readiness" | "none";

export type QuestionOrigin = "manual" | "default" | "industry" | "ai_generated";

export type SurveyQuestion = {
  id: number;
  templateId: number;
  order: number;
  text: string;
  questionType: QuestionType;
  options: string[] | null;
  scoringDimension: ScoringDimension;
  weight: number;
  isRequired: boolean;
  isActive: boolean;
  origin: QuestionOrigin;
  dependsOnQuestion: number | null;
  showIfMinValue: number | null;
  excludesSelectedFrom: number | null;
};

export type SurveyTemplateSummary = {
  id: number;
  name: string;
  industry: string;
  industryLabel: string;
  serviceCategory: string;
  serviceCategoryLabel: string;
  description: string;
  isDefault: boolean;
  isActive: boolean;
  isPreparedDraft: boolean;
  preparedForCodeCompany: string | null;
  questionCount: number;
  createdAt: string | null;
};

export type SurveyTemplateDetail = SurveyTemplateSummary & {
  questions: SurveyQuestion[];
};

export type ResolvedTemplate = SurveyTemplateSummary & {
  matchedOn: "industry+service" | "industry" | "default_fallback";
  dwIndustry: string | null;
};

export type ClientContact = {
  id: number;
  codeCompany: string;
  fullName: string;
  email: string;
  roleTitle: string;
  isPrimary: boolean;
  isActive: boolean;
};

export type NewContactPayload = {
  code_company: string;
  full_name: string;
  email: string;
  role_title?: string;
  is_primary?: boolean;
};

export type DeleteQuestionResult = { deleted: boolean; deactivated: boolean };

// ── AI verdict / scoring engine ──────────────────────────────────────────

export type VerdictStatus = "pending" | "ready" | "failed";
export type VerdictSentiment = "positive" | "neutral" | "negative" | "mixed" | "";
export type RecommendedActionCategory = "retention" | "upsell" | "content" | "outreach" | "support";

export type RecommendedAction = {
  label: string;
  category: RecommendedActionCategory;
};

export type SurveyVerdict = {
  surveyId: number;
  status: VerdictStatus;
  overallScore: number | null;
  satisfactionScore: number | null;
  loyaltyScore: number | null;
  upsellReadinessScore: number | null;
  sentiment: VerdictSentiment;
  summary: string;
  riskFlags: string[];
  recommendedActions: RecommendedAction[];
  nextStepsReport: string;
  modelUsed: string;
  errorMessage: string;
  generationCount: number;
  generatedAt: string | null;
  reportSentAt: string | null;
  reportSendError: string;
};

export type SentSurveyStatus = "sent" | "completed" | "expired";

export type SentSurvey = {
  id: number;
  templateId: number;
  templateName: string;
  codeCompany: string;
  contactId: number | null;
  contactName: string | null;
  contactEmail: string | null;
  token: string;
  status: SentSurveyStatus;
  sentAt: string | null;
  completedAt: string | null;
  expiresAt: string | null;
  verdict: SurveyVerdict | null;
};

export type CompanyWithSubs = {
  codeCompany: string;
  companyName: string;
  dwIndustry: string | null;
};

export type CompanyFeedbackOverview = {
  codeCompany: string;
  companyName: string;
  contactCount: number;
  surveyCount: number;
  latestSurvey: SentSurvey | null;
};

export type SurveyResponseItem = {
  questionId: number;
  text: string;
  questionType: QuestionType;
  scoringDimension: ScoringDimension;
  weight: number;
  answer: string | number | string[];
  answeredAt: string;
};

export type SurveyFullDetail = SentSurvey & {
  responses: SurveyResponseItem[];
};

export const surveysApi = {
  listTemplates: (params?: { industry?: string; serviceCategory?: string; activeOnly?: boolean }) => {
    const qs = new URLSearchParams();
    if (params?.industry) qs.set("industry", params.industry);
    if (params?.serviceCategory) qs.set("service_category", params.serviceCategory);
    if (params?.activeOnly === false) qs.set("active_only", "false");
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return get<SurveyTemplateSummary[]>(`/surveys/templates/${suffix}`);
  },
  getTemplate: (templateId: number) =>
    get<SurveyTemplateDetail>(`/surveys/templates/${templateId}/`),
  resolveTemplate: (codeCompany: string, serviceCategory?: string) => {
    const suffix = serviceCategory ? `?service_category=${serviceCategory}` : "";
    return get<ResolvedTemplate>(`/surveys/templates/resolve/${codeCompany}/${suffix}`);
  },
  listCompaniesWithSubs: () =>
    get<CompanyWithSubs[]>("/surveys/companies-with-subs/"),
  prepareSurvey: (codeCompany: string, regenerate = false) =>
    post<SurveyTemplateDetail>(`/surveys/prepare/${codeCompany}/`, { regenerate }),
  prepareAiQuestions: (codeCompany: string) =>
    post<SurveyTemplateDetail>(`/surveys/prepare/${codeCompany}/ai-questions/`, {}),
  deleteQuestion: (questionId: number) =>
    del<DeleteQuestionResult>(`/surveys/questions/${questionId}/`),
  updateQuestion: (questionId: number, payload: Partial<{
    text: string; question_type: QuestionType; options: string[] | null;
    scoring_dimension: ScoringDimension; weight: number; is_required: boolean; is_active: boolean;
  }>) =>
    patch<SurveyQuestion>(`/surveys/questions/${questionId}/`, payload),

  listContacts: (codeCompany: string) =>
    get<ClientContact[]>(`/surveys/contacts/?code_company=${codeCompany}`),
  createContact: (payload: NewContactPayload) =>
    post<ClientContact>("/surveys/contacts/", payload),
  updateContact: (contactId: number, payload: Partial<NewContactPayload> & { is_active?: boolean }) =>
    patch<ClientContact>(`/surveys/contacts/${contactId}/`, payload),
  deleteContact: (contactId: number) =>
    del<void>(`/surveys/contacts/${contactId}/`),

  sendSurvey: (payload: { template_id: number; contact_id: number; expires_in_days?: number; sent_by_email?: string }) =>
    post<SentSurvey>("/surveys/send/", payload),
  listCompanySurveys: (codeCompany: string) =>
    get<SentSurvey[]>(`/surveys/company/${codeCompany}/surveys/`),
  listCompaniesOverview: () =>
    get<CompanyFeedbackOverview[]>("/surveys/overview/"),
  getSurveyDetail: (surveyId: number) =>
    get<SurveyFullDetail>(`/surveys/${surveyId}/`),
  runSurveyVerdict: (surveyId: number, recipientEmail?: string) =>
    post<SurveyVerdict>(`/surveys/${surveyId}/verdict/`, { recipient_email: recipientEmail }),
  deleteSurvey: (surveyId: number) =>
    del<void>(`/surveys/${surveyId}/`),
  // Not a JSON call — this is a direct link the browser downloads, so it
  // doesn't go through the get<T> helper. Use as an <a href> or
  // window.open() target, not with await.
  reportDownloadUrl: (surveyId: number) => `${API_BASE}/surveys/${surveyId}/report/`,

  getPublicSurvey: (token: string) =>
    get<PublicSurvey>(`/surveys/public/${token}/`),
  submitPublicSurvey: (token: string, answers: SurveyAnswer[]) =>
    post<{ submitted: boolean }>(`/surveys/public/${token}/submit/`, { answers }),

  listNotifications: (params?: { unreadOnly?: boolean; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.unreadOnly) qs.set("unread_only", "true");
    if (params?.limit) qs.set("limit", String(params.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return get<NotificationsResponse>(`/surveys/notifications/${suffix}`);
  },
  markNotificationRead: (id: number) =>
    post<{ ok: boolean }>(`/surveys/notifications/${id}/read/`, {}),
  markAllNotificationsRead: () =>
    post<{ markedRead: number }>("/surveys/notifications/read-all/", {}),
  deleteNotification: (id: number) =>
    del<void>(`/surveys/notifications/${id}/`),
  clearAllNotifications: () =>
    del<{ deleted: number }>("/surveys/notifications/clear-all/"),
  listCleanupRuns: (limit = 50) =>
    get<SurveyCleanupRun[]>(`/surveys/cleanup-runs/?limit=${limit}`),
};

export type PublicSurveyQuestion = {
  id: number;
  order: number;
  text: string;
  questionType: QuestionType;
  options: string[] | null;
  isRequired: boolean;
  dependsOnQuestion: number | null;
  showIfMinValue: number | null;
  excludesSelectedFrom: number | null;
};

export type PublicSurvey = {
  templateName: string;
  companyName: string;
  status: SentSurveyStatus;
  alreadyCompleted?: boolean;
  expired?: boolean;
  questions?: PublicSurveyQuestion[];
};

export type SurveyAnswer = { question_id: number; value: string | number | string[] };

export type NotificationEventType =
  | "survey_sent"
  | "survey_completed"
  | "verdict_ready"
  | "deal_created"
  | "deal_won"
  | "deal_lost"
  | "project_created"
  | "task_created"
  | "talend_refresh_success"
  | "talend_refresh_failed";

export type SurveyNotification = {
  id: number;
  eventType: NotificationEventType;
  title: string;
  body: string;
  codeCompany: string;
  relatedType: string;
  relatedId: string;
  isRead: boolean;
  createdAt: string;
};

export type NotificationsResponse = {
  items: SurveyNotification[];
  unreadCount: number;
};

export type SurveyCleanupSnapshotRow = {
  id: number;
  codeCompany: string;
  template: string;
  status: SentSurveyStatus;
  createdAt: string;
};

export type SurveyCleanupRun = {
  id: number;
  ranAt: string;
  cutoffDays: number;
  wasDryRun: boolean;
  deletedCount: number;
  details: SurveyCleanupSnapshotRow[];
};