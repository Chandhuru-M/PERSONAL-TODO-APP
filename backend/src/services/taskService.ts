import type { SupabaseClient } from '@supabase/supabase-js';

import { type Task, type TaskStatusFilter } from '../types/task.js';
import { type CreateTaskInput, type UpdateTaskInput } from '../validators/taskSchemas.js';

const TASKS_TABLE = 'tasks';

const orderBuilder = (query: any) =>
  query
    .order('is_completed', { ascending: true })
    .order('due_at', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: false });

export async function listTasks(
  client: SupabaseClient,
  userId: string,
  status: TaskStatusFilter,
): Promise<Task[]> {
  let query = client.from(TASKS_TABLE).select('*').eq('user_id', userId);

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfToday.getDate() + 1);

  switch (status) {
    case 'today':
      query = query
        .gte('due_at', startOfToday.toISOString())
        .lt('due_at', startOfTomorrow.toISOString())
        .eq('is_completed', false);
      break;
    case 'upcoming':
      query = query
        .gt('due_at', startOfTomorrow.toISOString())
        .eq('is_completed', false);
      break;
    case 'completed':
      query = query.eq('is_completed', true);
      break;
    default:
      break;
  }

  const { data, error } = await orderBuilder(query);

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function getTodayTasks(client: SupabaseClient, userId: string): Promise<Task[]> {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfToday.getDate() + 1);

  const { data, error } = await orderBuilder(
    client
      .from(TASKS_TABLE)
      .select('*')
      .eq('user_id', userId)
      .gte('due_at', startOfToday.toISOString())
      .lt('due_at', startOfTomorrow.toISOString())
      .eq('is_completed', false),
  );

  if (error) throw error;
  return data ?? [];
}

export async function createTask(
  client: SupabaseClient,
  userId: string,
  payload: CreateTaskInput,
): Promise<Task> {
  const { data, error } = await client
    .from(TASKS_TABLE)
    .insert({ ...normalizePayload(payload), user_id: userId })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function updateTask(
  client: SupabaseClient,
  userId: string,
  taskId: string,
  payload: UpdateTaskInput,
): Promise<Task> {
  const { data, error } = await client
    .from(TASKS_TABLE)
    .update({ ...normalizePayload(payload) })
    .eq('id', taskId)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function setTaskCompletion(
  client: SupabaseClient,
  userId: string,
  taskId: string,
  isCompleted: boolean,
): Promise<Task> {
  const { data, error } = await client
    .from(TASKS_TABLE)
    .update({ is_completed: isCompleted })
    .eq('id', taskId)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function deleteTask(
  client: SupabaseClient,
  userId: string,
  taskId: string,
): Promise<void> {
  const { error } = await client
    .from(TASKS_TABLE)
    .delete()
    .eq('id', taskId)
    .eq('user_id', userId);

  if (error) throw error;
}

function normalizePayload(payload: Partial<CreateTaskInput>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  if (payload.title !== undefined) {
    result.title = payload.title;
  }

  if (payload.description !== undefined) {
    result.description = payload.description ?? null;
  }

  if (payload.due_at !== undefined) {
    result.due_at = payload.due_at ?? null;
  }

  if (payload.reminder_at !== undefined) {
    result.reminder_at = payload.reminder_at ?? null;
  }

  return result;
}
