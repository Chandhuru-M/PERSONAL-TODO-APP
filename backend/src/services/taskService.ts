import type { SupabaseClient } from '@supabase/supabase-js';

import { type Task } from '../types/task.js';
import { type CreateTaskInput, type UpdateTaskInput } from '../validators/taskSchemas.js';

const TASKS_TABLE = 'tasks';

interface ListTaskOptions {
  range?: {
    start: Date;
    end: Date;
  };
  includeCompleted?: boolean;
}

const compareTasks = (a: Task, b: Task): number => {
  if (a.is_completed !== b.is_completed) {
    return a.is_completed ? 1 : -1;
  }

  const dueA = a.due_at ? new Date(a.due_at).getTime() : Number.NEGATIVE_INFINITY;
  const dueB = b.due_at ? new Date(b.due_at).getTime() : Number.NEGATIVE_INFINITY;

  if (dueA !== dueB) {
    return dueA - dueB;
  }

  const createdA = new Date(a.created_at).getTime();
  const createdB = new Date(b.created_at).getTime();
  return createdB - createdA;
};

export async function listTasks(
  client: SupabaseClient,
  userId: string,
  options: ListTaskOptions = {},
): Promise<Task[]> {
  const includeCompleted = options.includeCompleted ?? false;
  const tasks: Task[] = [];

  if (options.range) {
    let dateQuery = client
      .from(TASKS_TABLE)
      .select('*')
      .eq('user_id', userId)
      .gte('due_at', options.range.start.toISOString())
      .lt('due_at', options.range.end.toISOString());

    if (!includeCompleted) {
      dateQuery = dateQuery.eq('is_completed', false);
    }

    const { data, error } = await dateQuery;
    if (error) throw error;
    if (data) {
      tasks.push(...(data as Task[]));
    }
  }

  let routineQuery = client
    .from(TASKS_TABLE)
    .select('*')
    .eq('user_id', userId)
    .is('due_at', null);

  if (!includeCompleted) {
    routineQuery = routineQuery.eq('is_completed', false);
  }

  const { data: routines, error: routineError } = await routineQuery;
  if (routineError) throw routineError;
  if (routines) {
    tasks.push(...(routines as Task[]));
  }

  return tasks.sort(compareTasks);
}

export async function getTodayTasks(client: SupabaseClient, userId: string): Promise<Task[]> {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfToday.getDate() + 1);

  return listTasks(client, userId, {
    range: {
      start: startOfToday,
      end: startOfTomorrow,
    },
    includeCompleted: false,
  });
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
  return data as Task;
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
  return data as Task;
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
  return data as Task;
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
