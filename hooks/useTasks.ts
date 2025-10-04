import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import type { Task } from '@/types/task';
import { startOfDay } from '@/utils/dates';
import {
    MINUTES_IN_DAY,
    TimeRange,
    clampRangeToBounds,
    injectTimeMetadata,
    normalizeRange,
    parseTimeRange,
    rangeDuration,
    rangesOverlap,
    stripTimeMetadata,
} from '@/utils/time-range';

interface TaskState {
  loading: boolean;
  error: string | null;
  tasks: Task[];
}

interface DefaultRoutineSeed {
  title: string;
  summary: string;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  reminder?: {
    hour: number;
    minute: number;
  };
  isRest?: boolean;
}

interface DayRange {
  start: Date;
  end: Date;
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

  if (!a.due_at && !b.due_at) {
    const orderA = ROUTINE_ORDER.get(a.title.toLowerCase());
    const orderB = ROUTINE_ORDER.get(b.title.toLowerCase());
    if (orderA !== undefined || orderB !== undefined) {
      const valueA = orderA ?? Number.MAX_SAFE_INTEGER;
      const valueB = orderB ?? Number.MAX_SAFE_INTEGER;
      if (valueA !== valueB) {
        return valueA - valueB;
      }
    }
  }

  const createdA = new Date(a.created_at).getTime();
  const createdB = new Date(b.created_at).getTime();
  return createdB - createdA;
};

const getRangeForDate = (value: Date): DayRange => {
  const start = startOfDay(value);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
};

const isTaskWithinRange = (task: Task, range: DayRange): boolean => {
  if (!task.due_at) {
    return true;
  }
  const dueDate = new Date(task.due_at);
  return dueDate >= range.start && dueDate < range.end;
};

const sortTasks = (tasks: Task[]): Task[] => [...tasks].sort(compareTasks);

const countActiveTasks = (tasks: Task[]): number =>
  tasks.filter((task) => !task.is_completed).length;

const ROUTINE_VERSION = '3';
const ROUTINE_FLAG_KEY = 'default-routines-version';
const LEGACY_ROUTINE_FLAG_KEY = 'default-routines-created.v1';

const buildRoutineDescription = (seed: DefaultRoutineSeed): string => {
  const range = normalizeRange({
    startMinutes: seed.startHour * 60 + seed.startMinute,
    endMinutes: seed.endHour * 60 + seed.endMinute,
  });
  return injectTimeMetadata(seed.summary, range);
};

const buildReminderDate = (hour: number, minute: number): Date => {
  const base = startOfDay(new Date());
  base.setHours(hour, minute, 0, 0);
  if (base.getTime() <= Date.now()) {
    base.setDate(base.getDate() + 1);
  }
  return base;
};

const buildRoutineReminderDate = (seed: DefaultRoutineSeed): Date | null => {
  if (!seed.reminder) return null;
  return buildReminderDate(seed.reminder.hour, seed.reminder.minute);
};

const isSameMinute = (a?: string | null, b?: string | null): boolean => {
  if (!a && !b) return true;
  if (!a || !b) return false;

  const toMinute = (value: string): number | null => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return Math.floor(date.getTime() / 60000);
  };

  const minuteA = toMinute(a);
  const minuteB = toMinute(b);
  if (minuteA === null || minuteB === null) return false;
  return minuteA === minuteB;
};

const seedToRange = (seed: DefaultRoutineSeed): TimeRange =>
  normalizeRange({
    startMinutes: seed.startHour * 60 + seed.startMinute,
    endMinutes: seed.endHour * 60 + seed.endMinute,
  });

const DEFAULT_ROUTINE_RANGE_MAP = new Map<string, TimeRange>();
const DEFAULT_ROUTINE_SEED_MAP = new Map<string, DefaultRoutineSeed>();

const DEFAULT_ROUTINES: DefaultRoutineSeed[] = [
  {
    title: 'Sleep',
    summary: 'Wind down and get ready for tomorrow.',
    startHour: 23,
    startMinute: 0,
    endHour: 5,
    endMinute: 0,
    reminder: { hour: 23, minute: 0 },
  },
  {
    title: 'Early morning rest',
    summary: 'Ease into the day with light stretching or journaling.',
    startHour: 5,
    startMinute: 0,
    endHour: 8,
    endMinute: 0,
    isRest: true,
  },
  {
    title: 'Breakfast',
    summary: 'Start the day with a healthy meal.',
    startHour: 8,
    startMinute: 0,
    endHour: 9,
    endMinute: 0,
    reminder: { hour: 8, minute: 0 },
  },
  {
    title: 'Midday rest',
    summary: 'Focus, meetings, or flexible work time.',
    startHour: 9,
    startMinute: 0,
    endHour: 14,
    endMinute: 0,
    isRest: true,
  },
  {
    title: 'Lunch',
    summary: 'Fuel up during the midday break.',
    startHour: 14,
    startMinute: 0,
    endHour: 15,
    endMinute: 0,
    reminder: { hour: 14, minute: 0 },
  },
  {
    title: 'Afternoon rest',
    summary: 'Project work, errands, or downtime.',
    startHour: 15,
    startMinute: 0,
    endHour: 21,
    endMinute: 0,
    isRest: true,
  },
  {
    title: 'Evening wind-down',
    summary: 'Reflect, enjoy hobbies, or connect with family.',
    startHour: 21,
    startMinute: 0,
    endHour: 22,
    endMinute: 0,
    reminder: { hour: 21, minute: 0 },
  },
  {
    title: 'Late evening rest',
    summary: 'Light activities before heading to bed.',
    startHour: 22,
    startMinute: 0,
    endHour: 23,
    endMinute: 0,
    isRest: true,
  },
];

const ROUTINE_ORDER = new Map<string, number>();
const FOOD_ROUTINES = new Set(['breakfast', 'lunch']);
DEFAULT_ROUTINES.forEach((seed, index) => {
  ROUTINE_ORDER.set(seed.title.toLowerCase(), index);
  const key = seed.title.toLowerCase();
  DEFAULT_ROUTINE_RANGE_MAP.set(key, seedToRange(seed));
  DEFAULT_ROUTINE_SEED_MAP.set(key, seed);
});

const isSameDay = (value: string, compare: Date): boolean => {
  const target = startOfDay(new Date(value));
  return target.getTime() === startOfDay(compare).getTime();
};

const sanitizeDescription = (description: string | null): string => stripTimeMetadata(description);

const withTimeRange = (task: Task, range: TimeRange): Task => ({
  ...task,
  description: injectTimeMetadata(sanitizeDescription(task.description), range),
});

const toBlockingRange = (range: TimeRange): TimeRange => normalizeRange(range);

const mergeOverlaps = (segments: TimeRange[]): TimeRange[] => {
  if (segments.length === 0) return [];
  const sorted = segments
    .map((segment) => normalizeRange(segment))
    .sort((a, b) => a.startMinutes - b.startMinutes);
  const merged: TimeRange[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i += 1) {
    const current = merged[merged.length - 1];
    const next = sorted[i];
    if (current.endMinutes >= next.startMinutes) {
      current.endMinutes = Math.max(current.endMinutes, next.endMinutes);
    } else {
      merged.push({ ...next });
    }
  }
  return merged;
};

const findLargestGap = (bounds: TimeRange, blockers: TimeRange[]): TimeRange | null => {
  const normalizedBounds = normalizeRange(bounds);
  const relevantBlocks = mergeOverlaps(
    blockers
      .map((block) => clampRangeToBounds(block, normalizedBounds))
      .filter((block): block is TimeRange => Boolean(block)),
  );

  let cursor = normalizedBounds.startMinutes;
  let best: TimeRange | null = null;

  for (const block of relevantBlocks) {
    if (block.startMinutes > cursor) {
      const candidate: TimeRange = { startMinutes: cursor, endMinutes: block.startMinutes };
      if (!best || rangeDuration(candidate) > rangeDuration(best)) {
        best = candidate;
      }
    }
    cursor = Math.max(cursor, block.endMinutes);
  }

  if (cursor < normalizedBounds.endMinutes) {
    const candidate: TimeRange = { startMinutes: cursor, endMinutes: normalizedBounds.endMinutes };
    if (!best || rangeDuration(candidate) > rangeDuration(best)) {
      best = candidate;
    }
  }

  return best;
};

const adjustRestRange = (seedRange: TimeRange, blockers: TimeRange[]): TimeRange | null =>
  findLargestGap(seedRange, blockers);

const adjustFoodRange = (seedRange: TimeRange, blockers: TimeRange[]): TimeRange => {
  const normalizedSeed = normalizeRange(seedRange);
  const duration = rangeDuration(normalizedSeed);
  const overlapping = blockers.filter((block) => rangesOverlap(block, normalizedSeed));
  if (overlapping.length === 0) {
    return normalizedSeed;
  }
  const latestEnd = Math.max(...overlapping.map((block) => normalizeRange(block).endMinutes));
  let start = Math.max(normalizedSeed.startMinutes, latestEnd);
  if (start + duration > MINUTES_IN_DAY) {
    start = MINUTES_IN_DAY - duration;
  }
  return { startMinutes: start, endMinutes: start + duration };
};

const applyScheduleAdjustments = (tasks: Task[], selectedDate: Date): Task[] => {
  const routineTasks = tasks.filter((task) => !task.due_at);
  const routineByTitle = new Map<string, Task>();
  routineTasks.forEach((task) => {
    routineByTitle.set(task.title.toLowerCase(), task);
  });

  const blocking: TimeRange[] = tasks
    .filter((task) => task.due_at && isSameDay(task.due_at, selectedDate))
    .map((task) => parseTimeRange(task.description))
    .filter((range): range is TimeRange => Boolean(range))
    .map((range) => normalizeRange(range));

  const updates = new Map<string, Task>();
  const removed = new Set<string>();

  for (const seed of DEFAULT_ROUTINES) {
    const key = seed.title.toLowerCase();
    const routineTask = routineByTitle.get(key);
    if (!routineTask) {
      continue;
    }

    const seedRange = DEFAULT_ROUTINE_RANGE_MAP.get(key) ?? seedToRange(seed);

    if (!seed.isRest) {
      const range = FOOD_ROUTINES.has(key)
        ? adjustFoodRange(seedRange, blocking)
        : normalizeRange(seedRange);
      blocking.push(toBlockingRange(range));
      updates.set(routineTask.id, withTimeRange(routineTask, range));
    }
  }

  for (const seed of DEFAULT_ROUTINES) {
    if (!seed.isRest) {
      continue;
    }
    const key = seed.title.toLowerCase();
    const routineTask = routineByTitle.get(key);
    if (!routineTask) {
      continue;
    }
    const seedRange = DEFAULT_ROUTINE_RANGE_MAP.get(key) ?? seedToRange(seed);
    const gap = adjustRestRange(seedRange, blocking);
    if (!gap) {
      removed.add(routineTask.id);
      continue;
    }
    blocking.push(toBlockingRange(gap));
    updates.set(routineTask.id, withTimeRange(routineTask, gap));
  }

  return tasks
    .filter((task) => !removed.has(task.id))
    .map((task) => {
      if (!task.due_at) {
        return updates.get(task.id) ?? task;
      }
      return task;
    });
};

export function useTasks() {
  const [selectedDate, setSelectedDate] = useState<Date>(() => startOfDay(new Date()));
  const [state, setState] = useState<TaskState>({
    loading: true,
    error: null,
    tasks: [],
  });
  const seedingRef = useRef(false);

  const range = useMemo(() => getRangeForDate(selectedDate), [selectedDate]);

  const adjustForSelectedDate = useCallback(
    (tasks: Task[]): Task[] => sortTasks(applyScheduleAdjustments(tasks, selectedDate)),
    [selectedDate],
  );

  const ensureDefaultRoutines = useCallback(
    async (existing: Task[]): Promise<Task[]> => {
      if (seedingRef.current) {
        return existing;
      }

      seedingRef.current = true;

      try {
        const legacyFlag = await AsyncStorage.getItem(LEGACY_ROUTINE_FLAG_KEY);
        const storedVersion =
          (await AsyncStorage.getItem(ROUTINE_FLAG_KEY)) ?? (legacyFlag ? '1' : null);
        const shouldUpgrade = storedVersion !== ROUTINE_VERSION;

        const routines = existing.filter((task) => !task.due_at);
        const routineMap = new Map<string, Task>(
          routines.map((task) => [task.title.toLowerCase(), task]),
        );

        let nextTasks = [...existing];
        let changed = false;

        for (const seed of DEFAULT_ROUTINES) {
          const key = seed.title.toLowerCase();
          const description = buildRoutineDescription(seed);
          const reminderDate = buildRoutineReminderDate(seed);
          const current = routineMap.get(key);

          if (!current) {
            const payload: Parameters<typeof apiCreateTask>[0] = {
              title: seed.title,
              description,
              due_at: null,
              reminder_at: reminderDate ? reminderDate.toISOString() : null,
            };

            try {
              const task = await apiCreateTask(payload);
              if (task.reminder_at) {
                try {
                  await scheduleTaskReminder(task.id, task.title, new Date(task.reminder_at), {
                    repeatDaily: !task.due_at,
                  });
                } catch (scheduleError) {
                  console.warn('Failed to schedule routine reminder', seed.title, scheduleError);
                }
              }
              nextTasks.push(task);
              routineMap.set(key, task);
              changed = true;
            } catch (error) {
              console.warn('Failed to create default routine', seed.title, error);
            }
            continue;
          }

          if (!shouldUpgrade) {
            continue;
          }

          const updates: Parameters<typeof apiUpdateTask>[1] = {};
          let needsUpdate = false;

          if ((current.description ?? '') !== description) {
            updates.description = description;
            needsUpdate = true;
          }

          const desiredReminderIso = reminderDate ? reminderDate.toISOString() : null;
          const currentReminderIso = current.reminder_at ?? null;

          if (seed.reminder) {
            if (!isSameMinute(currentReminderIso, desiredReminderIso)) {
              updates.reminder_at = desiredReminderIso;
              needsUpdate = true;
            }
          } else if (currentReminderIso) {
            updates.reminder_at = null;
            needsUpdate = true;
          }

          if (!needsUpdate) {
            continue;
          }

          try {
            const updatedTask = await apiUpdateTask(current.id, updates);
            if (updatedTask.reminder_at) {
              try {
                await scheduleTaskReminder(
                  updatedTask.id,
                  updatedTask.title,
                  new Date(updatedTask.reminder_at),
                  { repeatDaily: !updatedTask.due_at },
                );
              } catch (scheduleError) {
                console.warn('Failed to schedule routine reminder', updatedTask.title, scheduleError);
              }
            } else {
              await cancelTaskReminder(updatedTask.id);
            }

            nextTasks = nextTasks.map((task) => (task.id === updatedTask.id ? updatedTask : task));
            routineMap.set(key, updatedTask);
            changed = true;
          } catch (error) {
            console.warn('Failed to update routine', seed.title, error);
          }
        }

        if (shouldUpgrade || changed) {
          await AsyncStorage.setItem(ROUTINE_FLAG_KEY, ROUTINE_VERSION);
          if (legacyFlag) {
            await AsyncStorage.removeItem(LEGACY_ROUTINE_FLAG_KEY);
          }
        }

        return nextTasks;
      } finally {
        seedingRef.current = false;
      }
    },
    [],
  );

  const refresh = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      let tasks = await apiFetchTasks({
        start: range.start.toISOString(),
        end: range.end.toISOString(),
        includeCompleted: true,
      });
  tasks = await ensureDefaultRoutines(tasks);
  tasks = sortTasks(tasks);
  const adjusted = adjustForSelectedDate(tasks);
  setState({ loading: false, error: null, tasks });
  await scheduleDailySummary(countActiveTasks(adjusted));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load tasks';
      setState((prev) => ({ ...prev, loading: false, error: message }));
    }
  }, [adjustForSelectedDate, ensureDefaultRoutines, range]);

  useEffect(() => {
    refresh().catch((err) => console.warn('Failed to fetch tasks', err));
    return () => {
      cancelDailySummary().catch(() => undefined);
    };
  }, [refresh]);

  const applyTaskUpdate = useCallback(
    async (task: Task) => {
      let nextTasks: Task[] = [];
      let shouldUpdateSummary = false;
      const withinRange = isTaskWithinRange(task, range);

      setState((prev) => {
        let updated = prev.tasks.slice();
        const index = updated.findIndex((item) => item.id === task.id);

        if (withinRange) {
          if (index === -1) {
            updated.push(task);
          } else {
            updated[index] = task;
          }
          shouldUpdateSummary = true;
        } else if (index !== -1) {
          updated.splice(index, 1);
          shouldUpdateSummary = true;
        }

        updated = sortTasks(updated);
        nextTasks = updated;
        return { ...prev, tasks: updated };
      });

      if (shouldUpdateSummary) {
        const adjusted = adjustForSelectedDate(nextTasks);
        await scheduleDailySummary(countActiveTasks(adjusted));
      }
    },
    [adjustForSelectedDate, range],
  );

  const applyTaskDeletion = useCallback(async (taskId: string) => {
    let nextTasks: Task[] = [];
    let removed = false;

    setState((prev) => {
      const filtered = prev.tasks.filter((task) => {
        if (task.id === taskId) {
          removed = true;
          return false;
        }
        return true;
      });
      const updated = sortTasks(filtered);
      nextTasks = updated;
      return { ...prev, tasks: updated };
    });

    if (removed) {
      const adjusted = adjustForSelectedDate(nextTasks);
      await scheduleDailySummary(countActiveTasks(adjusted));
    }
  }, [adjustForSelectedDate]);

  const handleCreateTask = useCallback(
    async (payload: Parameters<typeof apiCreateTask>[0]) => {
      const task = await apiCreateTask(payload);
      if (task.reminder_at) {
        try {
          await scheduleTaskReminder(task.id, task.title, new Date(task.reminder_at), {
            repeatDaily: !task.due_at,
          });
        } catch (error) {
          console.warn('Failed to schedule reminder', task.id, error);
        }
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
        try {
          await scheduleTaskReminder(task.id, task.title, new Date(task.reminder_at), {
            repeatDaily: !task.due_at,
          });
        } catch (error) {
          console.warn('Failed to schedule reminder', task.id, error);
        }
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
      if (task.reminder_at) {
        try {
          if (task.due_at) {
            if (task.is_completed) {
              await cancelTaskReminder(task.id);
            } else {
              await scheduleTaskReminder(task.id, task.title, new Date(task.reminder_at), {
                repeatDaily: false,
              });
            }
          } else {
            await scheduleTaskReminder(task.id, task.title, new Date(task.reminder_at), {
              repeatDaily: true,
            });
          }
        } catch (error) {
          console.warn('Failed to update reminder', task.id, error);
        }
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

  const tasks = useMemo(() => adjustForSelectedDate(state.tasks), [adjustForSelectedDate, state.tasks]);

  return {
    selectedDate,
    setSelectedDate,
    tasks,
    loading: state.loading,
    error: state.error,
    refresh,
    createTask: handleCreateTask,
    updateTask: handleUpdateTask,
    toggleComplete: handleToggleComplete,
    deleteTask: handleDeleteTask,
  };
}
