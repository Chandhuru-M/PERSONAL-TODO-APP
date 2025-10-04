import type { PostgrestError } from '@supabase/supabase-js';
import { Router, type Response } from 'express';
import { ZodError } from 'zod';

import { requireUser, type AuthedRequest } from '../middleware/requireUser.js';
import {
    createTask,
    deleteTask,
    getTodayTasks,
    listTasks,
    setTaskCompletion,
    updateTask,
} from '../services/taskService.js';
import {
    createTaskSchema,
    taskQuerySchema,
    toggleCompleteSchema,
    updateTaskSchema,
} from '../validators/taskSchemas.js';

export const tasksRouter = Router();

tasksRouter.use(requireUser);

tasksRouter.get('/', async (req, res) => {
  try {
    const { userSupabase } = req as AuthedRequest;
    const rawStart = Array.isArray(req.query.start) ? req.query.start[0] : req.query.start;
    const rawEnd = Array.isArray(req.query.end) ? req.query.end[0] : req.query.end;
    const rawIncludeCompleted = Array.isArray(req.query.includeCompleted)
      ? req.query.includeCompleted[0]
      : req.query.includeCompleted;
    const { start, end, includeCompleted } = taskQuerySchema.parse({
      start: rawStart,
      end: rawEnd,
      includeCompleted: rawIncludeCompleted,
    });

    if (!req.userId || !userSupabase) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const range = start && end ? { start: new Date(start), end: new Date(end) } : undefined;
    const tasks = await listTasks(userSupabase, req.userId, {
      range,
      includeCompleted,
    });
    res.json({ data: tasks });
  } catch (err) {
    handleError(err, res);
  }
});

tasksRouter.get('/summary/today', async (req, res) => {
  try {
    const { userSupabase } = req as AuthedRequest;
    if (!req.userId || !userSupabase) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const tasks = await getTodayTasks(userSupabase, req.userId);
    res.json({ data: { count: tasks.length, tasks } });
  } catch (err) {
    handleError(err, res);
  }
});

tasksRouter.post('/', async (req, res) => {
  try {
    const { userSupabase } = req as AuthedRequest;
    if (!req.userId || !userSupabase) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const payload = createTaskSchema.parse(req.body);
    const task = await createTask(userSupabase, req.userId, payload);
    res.status(201).json({ data: task });
  } catch (err) {
    handleError(err, res);
  }
});

tasksRouter.patch('/:id', async (req, res) => {
  try {
    const { userSupabase } = req as AuthedRequest;
    if (!req.userId || !userSupabase) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const payload = updateTaskSchema.parse(req.body);
    const task = await updateTask(userSupabase, req.userId, req.params.id, payload);
    res.json({ data: task });
  } catch (err) {
    handleError(err, res);
  }
});

tasksRouter.patch('/:id/complete', async (req, res) => {
  try {
    const { userSupabase } = req as AuthedRequest;
    if (!req.userId || !userSupabase) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const { is_completed } = toggleCompleteSchema.parse(req.body);
    const task = await setTaskCompletion(
      userSupabase,
      req.userId,
      req.params.id,
      is_completed,
    );
    res.json({ data: task });
  } catch (err) {
    handleError(err, res);
  }
});

tasksRouter.delete('/:id', async (req, res) => {
  try {
    const { userSupabase } = req as AuthedRequest;
    if (!req.userId || !userSupabase) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    await deleteTask(userSupabase, req.userId, req.params.id);
    res.status(204).send();
  } catch (err) {
    handleError(err, res);
  }
});

function handleError(err: unknown, res: Response): void {
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'Validation failed', details: err.flatten() });
    return;
  }

  if (isPostgrestError(err)) {
    if (err.code === 'PGRST116') {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    res.status(400).json({ error: err.message, details: err.details });
    return;
  }

  if (typeof err === 'object' && err !== null && 'message' in err) {
    res.status(500).json({ error: (err as { message: string }).message });
    return;
  }

  res.status(500).json({ error: 'Unexpected error' });
}

function isPostgrestError(error: unknown): error is PostgrestError {
  return Boolean(error && typeof error === 'object' && 'code' in error && 'message' in error);
}
