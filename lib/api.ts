import { API_ROUTES } from '@/constants/api';
import type { Task, TaskSummary } from '@/types/task';
import type { UserProfile } from '@/types/user';
import { supabase } from './supabase';

interface ApiResponse<T> {
  data: T;
  message?: string;
}

async function withAuthHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (!token) {
    throw new Error('User is not authenticated');
  }

  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  } satisfies HeadersInit;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const message = errorBody.error ?? response.statusText;
    throw new Error(typeof message === 'string' ? message : 'Request failed');
  }

  const body = (await response.json()) as ApiResponse<T>;
  return body.data;
}

interface FetchTasksParams {
  start?: string;
  end?: string;
  includeCompleted?: boolean;
}

export async function fetchTasks(params: FetchTasksParams = {}): Promise<Task[]> {
  const headers = await withAuthHeaders();
  const url = new URL(API_ROUTES.tasks);
  if (params.start) {
    url.searchParams.set('start', params.start);
  }
  if (params.end) {
    url.searchParams.set('end', params.end);
  }
  if (params.includeCompleted) {
    url.searchParams.set('includeCompleted', String(params.includeCompleted));
  }

  const response = await fetch(url.toString(), {
    headers,
  });

  return handleResponse<Task[]>(response);
}

export async function fetchTodaySummary(): Promise<TaskSummary> {
  const headers = await withAuthHeaders();
  const response = await fetch(`${API_ROUTES.tasks}/summary/today`, { headers });
  return handleResponse<TaskSummary>(response);
}

export async function fetchCurrentUser(): Promise<UserProfile> {
  const headers = await withAuthHeaders();
  const response = await fetch(API_ROUTES.currentUser, { headers });
  return handleResponse<UserProfile>(response);
}

interface TaskPayload {
  title?: string;
  description?: string | null;
  due_at?: string | null;
  reminder_at?: string | null;
}

export async function createTask(payload: TaskPayload): Promise<Task> {
  const headers = await withAuthHeaders();
  const response = await fetch(API_ROUTES.tasks, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  return handleResponse<Task>(response);
}

export async function updateTask(taskId: string, payload: TaskPayload): Promise<Task> {
  const headers = await withAuthHeaders();
  const response = await fetch(`${API_ROUTES.tasks}/${taskId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(payload),
  });

  return handleResponse<Task>(response);
}

export async function setTaskCompletion(taskId: string, isCompleted: boolean): Promise<Task> {
  const headers = await withAuthHeaders();
  const response = await fetch(`${API_ROUTES.tasks}/${taskId}/complete`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ is_completed: isCompleted }),
  });

  return handleResponse<Task>(response);
}

export async function deleteTask(taskId: string): Promise<void> {
  const headers = await withAuthHeaders();
  const response = await fetch(`${API_ROUTES.tasks}/${taskId}`, {
    method: 'DELETE',
    headers,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const message = errorBody.error ?? response.statusText;
    throw new Error(typeof message === 'string' ? message : 'Failed to delete task');
  }
}
