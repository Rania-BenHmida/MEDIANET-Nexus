import { get, post, patch, del } from "./client";

export type Project = {
  id: number;
  project_code: string;
  project_name: string;
  team_name: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string | null;
  description: string | null;
  owner_id: number | null;
  owner_code: string | null;
  owner_name: string | null;
  company_id: number | null;
  company_code: string | null;
  company_name: string | null;
  section_code: string | null;
  section_name: string | null;
};

export type NewProject = {
  project_name: string;
  team_name?: string;
  owner_id?: number;
  company_id?: number;
  section_code?: string;
  start_date?: string;
  end_date?: string;
  status?: string;
  description?: string;
};

export type ProjectFilters = {
  status?: string;
  owner_name?: string;
  company_name?: string;
};

export type TaskComment = {
  id: number;
  content: string;
  full_name: string | null;
  created_at: string;
};

export type Task = {
  id: number;
  task_code: string;
  name: string;
  task_type: string | null;
  description: string | null;
  project_id: number | null;
  project_name: string | null;
  owner_id: number | null;
  owner_name: string | null;
  company_id: number | null;
  company_name: string | null;
  tag_id: number | null;
  tag_name: string | null;
  tag_color: string | null;
  start_date: string | null;
  due_date: string | null;
  end_date: string | null;
  completed: boolean;
  comments: TaskComment[];
};

export type NewTask = {
  name: string;
  project_id: number;
  project_name: string;
  description?: string;
  tag_id?: number;
  tag_name?: string;
  due_date?: string;
};

export type TaskFilters = {
  project_id?: number;
  tag_name?: string;
  completed?: boolean;
};

function buildQuery(params?: Record<string, unknown>): string {
  if (!params) return "";
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") usp.set(k, String(v));
  });
  const qs = usp.toString();
  return qs ? `?${qs}` : "";
}

export const projectsApi = {
  list:   (filters?: ProjectFilters) => get<Project[]>(`/projects/${buildQuery(filters)}`),
  get:    (id: number)               => get<Project>(`/projects/${id}/`),
  create: (data: NewProject)         => post<Project>("/projects/", data),
  update: (id: number, data: Partial<NewProject>) => patch<Project>(`/projects/${id}/`, data),

  // Distinct statuses present in Dim_Project.status (canonical snake_case),
  // sourced live from the data so Talend-introduced values still appear.
  statuses: () => get<string[]>("/projects/statuses/"),

  listTasks:  (filters?: TaskFilters) => get<Task[]>(`/projects/tasks/${buildQuery(filters)}`),
  getTask:    (id: number)            => get<Task>(`/projects/tasks/${id}/`),
  createTask: (data: NewTask) => post<{ success: boolean; id: string }>("/projects/tasks/create/", data),
  updateTask: (id: number, data: { tag_id?: number; completed?: boolean; due_date?: string; end_date?: string }) =>
    patch<Task>(`/projects/tasks/${id}/`, data),
  deletePendingTask: (id: string) => del<void>(`/projects/tasks/pending/${id}/delete/`),
  deleteTask:        (id: number) => del<void>(`/projects/tasks/${id}/delete/`),
};