// use-surveys.ts — sits next to use-customers.ts / use-deals.ts

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { surveysApi, type NewContactPayload, type SurveyAnswer } from "@/lib/api";

export const surveyKeys = {
  all:      ["surveys"] as const,
  templates: () => [...surveyKeys.all, "templates"] as const,
  template:  (id: number) => [...surveyKeys.all, "templates", id] as const,
  resolve:   (codeCompany: string) => [...surveyKeys.all, "resolve", codeCompany] as const,
  contacts:  (codeCompany: string) => [...surveyKeys.all, "contacts", codeCompany] as const,
  companySurveys: (codeCompany: string) => [...surveyKeys.all, "company", codeCompany] as const,
  survey:    (id: number) => [...surveyKeys.all, "survey", id] as const,
};

export function useSurveyTemplates(params?: { industry?: string; serviceCategory?: string }) {
  return useQuery({
    queryKey: [...surveyKeys.templates(), params ?? {}],
    queryFn:  () => surveysApi.listTemplates(params),
  });
}

export function useSurveyTemplate(templateId: number | null) {
  return useQuery({
    queryKey: surveyKeys.template(templateId ?? -1),
    queryFn:  () => surveysApi.getTemplate(templateId as number),
    enabled:  templateId !== null && templateId > 0,
  });
}

export function useResolveTemplate(codeCompany: string | null) {
  return useQuery({
    queryKey: surveyKeys.resolve(codeCompany ?? ""),
    queryFn:  () => surveysApi.resolveTemplate(codeCompany as string),
    enabled:  !!codeCompany,
  });
}

// ── Client contacts ──────────────────────────────────────────────────────

export function useClientContacts(codeCompany: string | null) {
  return useQuery({
    queryKey: surveyKeys.contacts(codeCompany ?? ""),
    queryFn:  () => surveysApi.listContacts(codeCompany as string),
    enabled:  !!codeCompany,
  });
}

export function useCreateContact(codeCompany: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: NewContactPayload) => surveysApi.createContact(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: surveyKeys.contacts(codeCompany) });
    },
  });
}

export function useUpdateContact(codeCompany: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { id: number; payload: Partial<NewContactPayload> & { is_active?: boolean } }) =>
      surveysApi.updateContact(params.id, params.payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: surveyKeys.contacts(codeCompany) });
    },
  });
}

export function useDeleteContact(codeCompany: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (contactId: number) => surveysApi.deleteContact(contactId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: surveyKeys.contacts(codeCompany) });
    },
  });
}

// ── Sending ───────────────────────────────────────────────────────────────

export function useSendSurvey(codeCompany: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { template_id: number; contact_id: number; expires_in_days?: number }) =>
      surveysApi.sendSurvey(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: surveyKeys.contacts(codeCompany) });
      queryClient.invalidateQueries({ queryKey: surveyKeys.companySurveys(codeCompany) });
    },
  });
}

// ── Sent surveys + AI verdict (fiche client) ───────────────────────────────

export function useCompanySurveys(codeCompany: string | null) {
  return useQuery({
    queryKey: surveyKeys.companySurveys(codeCompany ?? ""),
    queryFn:  () => surveysApi.listCompanySurveys(codeCompany as string),
    enabled:  !!codeCompany,
  });
}

export function useSurveyDetail(surveyId: number | null) {
  return useQuery({
    queryKey: surveyKeys.survey(surveyId ?? -1),
    queryFn:  () => surveysApi.getSurveyDetail(surveyId as number),
    enabled:  surveyId !== null && surveyId > 0,
  });
}

export function useRunSurveyVerdict(codeCompany: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (surveyId: number) => surveysApi.runSurveyVerdict(surveyId),
    onSuccess: (_data, surveyId) => {
      queryClient.invalidateQueries({ queryKey: surveyKeys.companySurveys(codeCompany) });
      queryClient.invalidateQueries({ queryKey: surveyKeys.survey(surveyId) });
    },
  });
}

export function useCompaniesOverview() {
  return useQuery({
    queryKey: [...surveyKeys.all, "overview"],
    queryFn:  () => surveysApi.listCompaniesOverview(),
  });
}

// ── Public survey (client-facing fill page) ─────────────────────────────

export function usePublicSurvey(token: string) {
  return useQuery({
    queryKey: ["public-survey", token],
    queryFn:  () => surveysApi.getPublicSurvey(token),
    enabled:  !!token,
    retry:    false,
  });
}

export function useSubmitPublicSurvey(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (answers: SurveyAnswer[]) => surveysApi.submitPublicSurvey(token, answers),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["public-survey", token] });
    },
  });
}

// ── Notifications ────────────────────────────────────────────────────────
// Simple polling — no websockets/SSE infra here, so the bell refreshes
// itself every 20s rather than pushing in real time. Good enough for a
// small CS team; would need a socket layer to go truly live.

export function useNotifications() {
  return useQuery({
    queryKey: ["surveys", "notifications"],
    queryFn: () => surveysApi.listNotifications({ limit: 20 }),
    refetchInterval: 20_000,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => surveysApi.markNotificationRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["surveys", "notifications"] }),
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => surveysApi.markAllNotificationsRead(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["surveys", "notifications"] }),
  });
}

export function useDeleteNotification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => surveysApi.deleteNotification(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["surveys", "notifications"] }),
  });
}

export function useClearAllNotifications() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => surveysApi.clearAllNotifications(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["surveys", "notifications"] }),
  });
}