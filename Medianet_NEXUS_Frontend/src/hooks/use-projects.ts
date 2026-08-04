import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  projectsApi, type NewProject, type ProjectFilters, type NewTask, type TaskFilters,
} from "@/lib/api";

export const projectKeys = {
  all:    ["projects"]                         as const,
  lists:  ()                   => [...projectKeys.all, "list"]   as const,
  list:   (f?: ProjectFilters) => [...projectKeys.lists(), f]    as const,
  detail: (id: number)         => [...projectKeys.all, "detail", id] as const,
  statuses: ()                 => [...projectKeys.all, "statuses"] as const,
};

export const taskKeys = {
  all:    ["tasks"]                       as const,
  lists:  ()                => [...taskKeys.all, "list"] as const,
  list:   (f?: TaskFilters) => [...taskKeys.lists(), f]  as const,
  detail: (id: number)      => [...taskKeys.all, "detail", id] as const,
};

// ── Projects ──────────────────────────────────────────────────────────────────

export function useProjects(filters?: ProjectFilters) {
  return useQuery({ queryKey: projectKeys.list(filters), queryFn: () => projectsApi.list(filters) });
}

export function useProject(id: number) {
  return useQuery({
    queryKey: projectKeys.detail(id),
    queryFn:  () => projectsApi.get(id),
    enabled:  Number.isFinite(id),
  });
}

// Distinct statuses live from the data. staleTime is high because the set of
// statuses changes rarely — no need to refetch on every mount.
export function useProjectStatuses() {
  return useQuery({
    queryKey:  projectKeys.statuses(),
    queryFn:   () => projectsApi.statuses(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: NewProject) => projectsApi.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectKeys.lists() }),
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: number; data: Partial<NewProject> }) => projectsApi.update(vars.id, vars.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectKeys.lists() }),
  });
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export function useTasks(filters?: TaskFilters) {
  return useQuery({ queryKey: taskKeys.list(filters), queryFn: () => projectsApi.listTasks(filters) });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: NewTask) => projectsApi.createTask(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: taskKeys.lists() }),
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: number; data: { tag_id?: number; completed?: boolean; due_date?: string; end_date?: string } }) =>
      projectsApi.updateTask(vars.id, vars.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: taskKeys.lists() }),
  });
}

export function useDeletePendingTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => projectsApi.deletePendingTask(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: taskKeys.lists() }),
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => projectsApi.deleteTask(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: taskKeys.lists() }),
  });
}