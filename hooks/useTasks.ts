import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';

import {
    createTask as apiCreateTask,
    deleteTask as apiDeleteTask,
    fetchTasks as apiFetchTasks,
    setTaskCompletion as apiSetTaskCompletion,
    updateTask as apiUpdateTask,
} from '@/lib/api';
import {
    cancelDailySummary,
    cancelTaskReminder,
    scheduleDailySummary,
    scheduleTaskReminder,
} from '@/lib/notifications';
import type { Task, TaskStatus } from '@/types/task';

type VisibleStatus = Exclude<TaskStatus, 'all'>;

interface UseTasksOptions {
  initialStatus?: VisibleStatus;
}

interface TaskState {
  loading: boolean;
  error: string | null;
  status: VisibleStatus;
  tasks: Task[];
  loaded: boolean;
}

const STATUSES: VisibleStatus[] = ['today', 'upcoming', 'completed'];

function compareTasks(a: Task, b: Task): number {
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
}

function upsertTask(tasks: Task[], task: Task): Task[] {
  const existingIndex = tasks.findIndex((item) => item.id === task.id);
  const updated =
    existingIndex === -1
      ? [...tasks, task]
      : [...tasks.slice(0, existingIndex), task, ...tasks.slice(existingIndex + 1)];
  return updated.sort(compareTasks);
}

function removeTask(tasks: Task[], taskId: string): Task[] {
  return tasks.filter((task) => task.id !== taskId);
}

function resolveTaskStatuses(task: Task): VisibleStatus[] {
  if (task.is_completed) {
    return ['completed'];
  }

  if (!task.due_at) {
    return [];
  }

  const dueDate = new Date(task.due_at);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfToday.getDate() + 1);

  if (dueDate >= startOfToday && dueDate < startOfTomorrow) {
    return ['today'];
  }

  if (dueDate.getTime() > startOfTomorrow.getTime()) {
    return ['upcoming'];
  }

  return [];
}

export function useTasks({ initialStatus = 'today' }: UseTasksOptions = {}) {
  const [status, setStatus] = useState<VisibleStatus>(initialStatus);
  const [state, setState] = useState<Record<VisibleStatus, TaskState>>(() =>
    STATUSES.reduce((acc, key) => {
      acc[key] = {
        loading: key === initialStatus,
        error: null,
        status: key,
        tasks: [],
        loaded: false,
      } satisfies TaskState;
      return acc;
    }, {} as Record<VisibleStatus, TaskState>),
  );

  const currentState = state[status];

  const setStatusState = useCallback((key: VisibleStatus, patch: Partial<TaskState>) => {
    setState((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        ...patch,
      },
    }));
  }, []);

  const refreshStatus = useCallback(
    async (key: VisibleStatus) => {
      setStatusState(key, { loading: true, error: null });
      try {
        const tasks = await apiFetchTasks(key);
        setStatusState(key, { tasks, loading: false, error: null, loaded: true });

        if (key === 'today') {
          await scheduleDailySummary(tasks.length);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to load tasks';
        setStatusState(key, { error: message, loading: false, loaded: true });
      }
    },
    [setStatusState],
  );

  const refreshAll = useCallback(async () => {
    await Promise.all(STATUSES.map((key) => refreshStatus(key)));
  }, [refreshStatus]);

  const applyTaskUpdate = useCallback(
    async (task: Task) => {
      const targetStatuses = resolveTaskStatuses(task);
      let shouldUpdateSummary = false;
      let nextTodayCount = 0;

      setState((prev) => {
        const next = { ...prev };

        STATUSES.forEach((key) => {
          const bucket = prev[key];
          if (!bucket.loaded) {
            return;
          }

          if (targetStatuses.includes(key)) {
            const tasks = upsertTask(bucket.tasks, task);
            next[key] = {
              ...bucket,
              tasks,
            } satisfies TaskState;

            if (key === 'today') {
              shouldUpdateSummary = true;
              nextTodayCount = tasks.length;
            }
          } else if (bucket.tasks.some((existing) => existing.id === task.id)) {
            const tasks = removeTask(bucket.tasks, task.id);
            next[key] = {
              ...bucket,
              tasks,
            } satisfies TaskState;

            if (key === 'today') {
              shouldUpdateSummary = true;
              nextTodayCount = tasks.length;
            }
          }
        });

        return next;
      });

      if (shouldUpdateSummary) {
        await scheduleDailySummary(nextTodayCount);
      }
    },
    [scheduleDailySummary],
  );

  const applyTaskDeletion = useCallback(async (taskId: string) => {
    let shouldUpdateSummary = false;
    let nextTodayCount = 0;

    setState((prev) => {
      const next = { ...prev };

      STATUSES.forEach((key) => {
        const bucket = prev[key];
        if (!bucket.loaded) {
          return;
        }

        if (bucket.tasks.some((task) => task.id === taskId)) {
          const tasks = removeTask(bucket.tasks, taskId);
          next[key] = {
            ...bucket,
            tasks,
          } satisfies TaskState;

          if (key === 'today') {
            shouldUpdateSummary = true;
            nextTodayCount = tasks.length;
          }
        }
      });

      return next;
    });

    if (shouldUpdateSummary) {
      await scheduleDailySummary(nextTodayCount);
    }
  }, [scheduleDailySummary]);

  useEffect(() => {
    refreshStatus(initialStatus).catch((err) => console.warn('Failed to fetch tasks', err));
    return () => {
      cancelDailySummary().catch(() => undefined);
    };
  }, [initialStatus, refreshStatus]);

  useEffect(() => {
    if (!currentState.loaded && !currentState.loading) {
      refreshStatus(status).catch((err) => console.warn('Failed to refresh tasks', err));
    }
  }, [status, currentState.loaded, currentState.loading, refreshStatus]);

  const handleCreateTask = useCallback(
    async (payload: Parameters<typeof apiCreateTask>[0]) => {
      const task = await apiCreateTask(payload);
      if (task.reminder_at) {
        await scheduleTaskReminder(task.id, task.title, new Date(task.reminder_at));
      }
      await applyTaskUpdate(task);
      return task;
    },
    [applyTaskUpdate],
  );

  const handleUpdateTask = useCallback(
    async (taskId: string, payload: Parameters<typeof apiUpdateTask>[1]) => {
      const task = await apiUpdateTask(taskId, payload);
      if (task.reminder_at) {
        await scheduleTaskReminder(task.id, task.title, new Date(task.reminder_at));
      } else {
        await cancelTaskReminder(task.id);
      }
      await applyTaskUpdate(task);
      return task;
    },
    [applyTaskUpdate],
  );

  const handleToggleComplete = useCallback(
    async (taskId: string, isCompleted: boolean) => {
      const task = await apiSetTaskCompletion(taskId, isCompleted);
      if (task.reminder_at && isCompleted) {
        await cancelTaskReminder(task.id);
      }
      await applyTaskUpdate(task);
      return task;
    },
    [applyTaskUpdate],
  );

  const handleDeleteTask = useCallback(
    async (taskId: string) => {
      try {
        await apiDeleteTask(taskId);
        await cancelTaskReminder(taskId);
        await applyTaskDeletion(taskId);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to delete task';
        Alert.alert('Delete failed', message);
      }
    },
    [applyTaskDeletion],
  );

  const groupedTasks = useMemo(() => state, [state]);

  return {
    status,
    setStatus,
    groupedTasks,
    currentState,
    refreshStatus,
    refreshAll,
    createTask: handleCreateTask,
    updateTask: handleUpdateTask,
    toggleComplete: handleToggleComplete,
    deleteTask: handleDeleteTask,
  };
}
