import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { useAuth } from '@/contexts/AuthContext';
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
import {
  DEFAULT_MEAL_PREFERENCES,
  MealPreferences,
  loadMealPreferences,
} from '@/storage/meal-preferences';
import type { Task } from '@/types/task';
import { startOfDay } from '@/utils/dates';
import {
  MINUTES_IN_DAY,
  TimeRange,
  clampRangeToBounds,
  injectTimeMetadata,
  minutesToDate,
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
  isFlexible?: boolean;
}

interface DayRange {
  start: Date;
  end: Date;
}

const ROUTINE_VERSION = '4';
const ROUTINE_FLAG_KEY = 'default-routines-version';
const LEGACY_ROUTINE_FLAG_KEY = 'default-routines-created.v1';

const WAKE_START = 4 * 60;
const WAKE_END = 5 * 60;
const SLEEP_START = 22 * 60;
const MIN_MEAL_DURATION = 60;
const EARLIEST_BREAKFAST = WAKE_END;
const LATEST_BREAKFAST = 11 * 60;
const LATEST_LUNCH = 17 * 60;
const LATEST_DINNER = SLEEP_START - MIN_MEAL_DURATION;

const ROUTINE_TITLES = {
  wake: 'Wake up and personal duties',
  workEarly: 'Schedule any work (early)',
  breakfast: 'Breakfast',
  workLateMorning: 'Schedule any work (late morning)',
  lunch: 'Lunch',
  workAfternoon: 'Schedule any work (afternoon)',
  dinner: 'Dinner',
  workEvening: 'Schedule any work (evening)',
  sleep: 'Sleep',
} as const;

type RoutineTitle = (typeof ROUTINE_TITLES)[keyof typeof ROUTINE_TITLES];

const FLEXIBLE_ROUTINE_TITLES = new Set<string>(
  [
    ROUTINE_TITLES.workEarly,
    ROUTINE_TITLES.workLateMorning,
    ROUTINE_TITLES.workAfternoon,
    ROUTINE_TITLES.workEvening,
  ].map((title) => title.toLowerCase()),
);

const FOOD_ROUTINE_TITLES = new Set<string>(
  [ROUTINE_TITLES.breakfast, ROUTINE_TITLES.lunch, ROUTINE_TITLES.dinner].map((title) =>
    title.toLowerCase(),
  ),
);

const ANCHOR_ROUTINE_TITLES = new Set<string>([
  ...FOOD_ROUTINE_TITLES,
  ROUTINE_TITLES.sleep.toLowerCase(),
]);

const MIN_ROUTINE_MINUTES = 2;

const PREVIOUS_ROUTINE_TITLES = new Set<string>(
  [
    'sleep',
    'early morning rest',
    'breakfast',
    'midday rest',
    'lunch',
    'afternoon rest',
    'evening wind-down',
    'late evening rest',
  ].map((title) => title.toLowerCase()),
);

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

const normalizeMealPreferences = (prefs: MealPreferences): MealPreferences => {
  const breakfast = clamp(prefs.breakfastStart, EARLIEST_BREAKFAST, LATEST_BREAKFAST);
  const lunch = clamp(prefs.lunchStart, breakfast + MIN_MEAL_DURATION, LATEST_LUNCH);
  const dinner = clamp(prefs.dinnerStart, lunch + MIN_MEAL_DURATION, LATEST_DINNER);
  return {
    breakfastStart: breakfast,
    lunchStart: lunch,
    dinnerStart: dinner,
  };
};

const minutesToHourMinute = (minutes: number): { hour: number; minute: number } => {
  const normalized = ((minutes % MINUTES_IN_DAY) + MINUTES_IN_DAY) % MINUTES_IN_DAY;
  return {
    hour: Math.floor(normalized / 60),
    minute: normalized % 60,
  };
};

const buildRoutineSeeds = (prefs: MealPreferences): DefaultRoutineSeed[] => {
  const normalized = normalizeMealPreferences(prefs);

  const breakfastStart = normalized.breakfastStart;
  const breakfastEnd = breakfastStart + MIN_MEAL_DURATION;
  const lunchStart = Math.max(normalized.lunchStart, breakfastEnd + MIN_MEAL_DURATION);
  const lunchEnd = lunchStart + MIN_MEAL_DURATION;
  const dinnerStart = Math.max(normalized.dinnerStart, lunchEnd + MIN_MEAL_DURATION);
  const dinnerEnd = dinnerStart + MIN_MEAL_DURATION;

  const earlyWork: [number, number] = [WAKE_END, breakfastStart];
  const lateMorningWork: [number, number] = [breakfastEnd, lunchStart];
  const afternoonWork: [number, number] = [lunchEnd, dinnerStart];
  const eveningWorkStart = Math.min(dinnerEnd, SLEEP_START);
  const eveningWork: [number, number] = [eveningWorkStart, SLEEP_START];

  const seeds: DefaultRoutineSeed[] = [
    {
      title: ROUTINE_TITLES.wake,
      summary: 'Ease into the day with stretching or reflection.',
      startHour: minutesToHourMinute(WAKE_START).hour,
      startMinute: minutesToHourMinute(WAKE_START).minute,
      endHour: minutesToHourMinute(WAKE_END).hour,
      endMinute: minutesToHourMinute(WAKE_END).minute,
    },
    {
      title: ROUTINE_TITLES.workEarly,
      summary: 'Tackle deep work before breakfast.',
      startHour: minutesToHourMinute(earlyWork[0]).hour,
      startMinute: minutesToHourMinute(earlyWork[0]).minute,
      endHour: minutesToHourMinute(earlyWork[1]).hour,
      endMinute: minutesToHourMinute(earlyWork[1]).minute,
      isFlexible: true,
    },
    {
      title: ROUTINE_TITLES.breakfast,
      summary: 'Fuel up for the morning ahead.',
      startHour: minutesToHourMinute(breakfastStart).hour,
      startMinute: minutesToHourMinute(breakfastStart).minute,
      endHour: minutesToHourMinute(breakfastEnd).hour,
      endMinute: minutesToHourMinute(breakfastEnd).minute,
      reminder: minutesToHourMinute(breakfastStart),
    },
    {
      title: ROUTINE_TITLES.workLateMorning,
      summary: 'Meetings, planning, and momentum building.',
      startHour: minutesToHourMinute(lateMorningWork[0]).hour,
      startMinute: minutesToHourMinute(lateMorningWork[0]).minute,
      endHour: minutesToHourMinute(lateMorningWork[1]).hour,
      endMinute: minutesToHourMinute(lateMorningWork[1]).minute,
      isFlexible: true,
    },
    {
      title: ROUTINE_TITLES.lunch,
      summary: 'Pause, refuel, and reset for the afternoon.',
      startHour: minutesToHourMinute(lunchStart).hour,
      startMinute: minutesToHourMinute(lunchStart).minute,
      endHour: minutesToHourMinute(lunchEnd).hour,
      endMinute: minutesToHourMinute(lunchEnd).minute,
      reminder: minutesToHourMinute(lunchStart),
    },
    {
      title: ROUTINE_TITLES.workAfternoon,
      summary: 'Focus on execution and collaborative work.',
      startHour: minutesToHourMinute(afternoonWork[0]).hour,
      startMinute: minutesToHourMinute(afternoonWork[0]).minute,
      endHour: minutesToHourMinute(afternoonWork[1]).hour,
      endMinute: minutesToHourMinute(afternoonWork[1]).minute,
      isFlexible: true,
    },
    {
      title: ROUTINE_TITLES.dinner,
      summary: 'Close the day with a nourishing meal.',
      startHour: minutesToHourMinute(dinnerStart).hour,
      startMinute: minutesToHourMinute(dinnerStart).minute,
      endHour: minutesToHourMinute(dinnerEnd).hour,
      endMinute: minutesToHourMinute(dinnerEnd).minute,
      reminder: minutesToHourMinute(dinnerStart),
    },
    {
      title: ROUTINE_TITLES.workEvening,
      summary: 'Tie up loose ends or pursue a side project.',
      startHour: minutesToHourMinute(eveningWork[0]).hour,
      startMinute: minutesToHourMinute(eveningWork[0]).minute,
      endHour: minutesToHourMinute(eveningWork[1]).hour,
      endMinute: minutesToHourMinute(eveningWork[1]).minute,
      isFlexible: true,
    },
    {
      title: ROUTINE_TITLES.sleep,
      summary: 'Rest well to prepare for tomorrow.',
      startHour: minutesToHourMinute(SLEEP_START).hour,
      startMinute: minutesToHourMinute(SLEEP_START).minute,
      endHour: minutesToHourMinute(WAKE_START).hour,
      endMinute: minutesToHourMinute(WAKE_START).minute,
      reminder: minutesToHourMinute(SLEEP_START),
    },
  ];

  return seeds;
};

const seedToRange = (seed: DefaultRoutineSeed): TimeRange =>
  normalizeRange({
    startMinutes: seed.startHour * 60 + seed.startMinute,
    endMinutes: seed.endHour * 60 + seed.endMinute,
  });

const buildRoutineDescription = (seed: DefaultRoutineSeed): string => {
  const range = seedToRange(seed);
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

const computeNextDailyReminderDate = (reminderIso: string, reference: Date = new Date()): Date | null => {
  const parsed = new Date(reminderIso);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  const candidate = new Date(reference);
  candidate.setHours(parsed.getHours(), parsed.getMinutes(), parsed.getSeconds(), parsed.getMilliseconds());
  if (candidate <= reference) {
    candidate.setDate(candidate.getDate() + 1);
  }
  return candidate;
};

const isRoutineTask = (task: Task): boolean => !task.due_at;

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

const countActiveTasks = (tasks: Task[]): number => tasks.filter((task) => !task.is_completed).length;

const ensureRoutineReminderUpToDate = async (
  task: Task,
): Promise<{ task: Task; reminderDate: Date | null }> => {
  if (!task.reminder_at) {
    return { task, reminderDate: null };
  }

  const parsed = new Date(task.reminder_at);
  if (Number.isNaN(parsed.getTime())) {
    try {
      const updated = await apiUpdateTask(task.id, { reminder_at: null });
      return { task: updated, reminderDate: null };
    } catch (error) {
      console.warn('Failed to clear invalid reminder timestamp', task.id, error);
      return { task: { ...task, reminder_at: null }, reminderDate: null };
    }
  }

  if (!isRoutineTask(task)) {
    return { task, reminderDate: parsed };
  }

  const nextReminderDate = computeNextDailyReminderDate(task.reminder_at);
  if (!nextReminderDate) {
    try {
      const updated = await apiUpdateTask(task.id, { reminder_at: null });
      return { task: updated, reminderDate: null };
    } catch (error) {
      console.warn('Failed to clear routine reminder timestamp', task.id, error);
      return { task: { ...task, reminder_at: null }, reminderDate: null };
    }
  }

  const nextIso = nextReminderDate.toISOString();
  if (nextIso === task.reminder_at) {
    return { task, reminderDate: nextReminderDate };
  }

  try {
    const updated = await apiUpdateTask(task.id, { reminder_at: nextIso });
    return { task: updated, reminderDate: nextReminderDate };
  } catch (error) {
    console.warn('Failed to roll routine reminder forward', task.id, error);
    return { task: { ...task, reminder_at: nextIso }, reminderDate: nextReminderDate };
  }
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

const compareTasksFactory = (orderMap: Map<string, number>) => (a: Task, b: Task): number => {
  // Incomplete tasks come first
  if (a.is_completed !== b.is_completed) {
    return a.is_completed ? 1 : -1;
  }

  // Primary sort: time-of-day by parsed time metadata (minutes since midnight)
  const rangeA = parseTimeRange(a.description ?? null);
  const rangeB = parseTimeRange(b.description ?? null);
  const keyA = rangeA ? normalizeRange(rangeA).startMinutes : Number.POSITIVE_INFINITY;
  const keyB = rangeB ? normalizeRange(rangeB).startMinutes : Number.POSITIVE_INFINITY;

  if (keyA !== keyB) {
    return keyA - keyB;
  }

  // Secondary: for routines (no due_at), preserve defined routine order
  if (!a.due_at && !b.due_at) {
    const orderA = orderMap.get(a.title.toLowerCase());
    const orderB = orderMap.get(b.title.toLowerCase());
    if (orderA !== undefined || orderB !== undefined) {
      const valueA = orderA ?? Number.MAX_SAFE_INTEGER;
      const valueB = orderB ?? Number.MAX_SAFE_INTEGER;
      if (valueA !== valueB) {
        return valueA - valueB;
      }
    }
  }

  // Final tiebreaker: most recently created first
  const createdA = new Date(a.created_at).getTime();
  const createdB = new Date(b.created_at).getTime();
  return createdB - createdA;
};

const sortTasks = (tasks: Task[], comparator: (a: Task, b: Task) => number): Task[] =>
  [...tasks].sort(comparator);

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

const adjustFlexibleRange = (seedRange: TimeRange, blockers: TimeRange[]): TimeRange | null =>
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

const applyScheduleAdjustments = (
  tasks: Task[],
  selectedDate: Date,
  seeds: DefaultRoutineSeed[],
  rangeMap: Map<string, TimeRange>,
  flexibleTitles: Set<string>,
  foodTitles: Set<string>,
  allowedTitles: Set<string>,
): Task[] => {
  const routineTasks = tasks.filter((task) => !task.due_at);
  const routineByTitle = new Map<string, Task>();
  routineTasks.forEach((task) => {
    routineByTitle.set(task.title.toLowerCase(), task);
  });

  const dayRange = getRangeForDate(selectedDate);
  const blocking: TimeRange[] = tasks
    .filter((task) => task.due_at && isTaskWithinRange(task, dayRange))
    .map((task) => parseTimeRange(task.description))
    .filter((range): range is TimeRange => Boolean(range))
    .map((range) => normalizeRange(range));

  const updates = new Map<string, Task>();
  const removed = new Set<string>();

  for (const seed of seeds) {
    const key = seed.title.toLowerCase();
    const routineTask = routineByTitle.get(key);
    if (!routineTask) {
      continue;
    }

    const seedRange = rangeMap.get(key) ?? seedToRange(seed);
    const existingRange = parseTimeRange(routineTask.description ?? null);
    const hasCustomRange = Boolean(existingRange);
    const baseRange = existingRange ?? seedRange;
    const normalizedBaseRange = normalizeRange(baseRange);

    if (hasCustomRange) {
      blocking.push(toBlockingRange(normalizedBaseRange));
      updates.set(routineTask.id, withTimeRange(routineTask, normalizedBaseRange));
      continue;
    }

    if (foodTitles.has(key)) {
      const range = adjustFoodRange(seedRange, blocking);
      blocking.push(toBlockingRange(range));
      updates.set(routineTask.id, withTimeRange(routineTask, range));
      continue;
    }

    if (flexibleTitles.has(key)) {
      const gap = adjustFlexibleRange(seedRange, blocking);
      if (!gap) {
        removed.add(routineTask.id);
        continue;
      }
      blocking.push(toBlockingRange(gap));
      updates.set(routineTask.id, withTimeRange(routineTask, gap));
      continue;
    }

    blocking.push(toBlockingRange(seedRange));
    updates.set(routineTask.id, withTimeRange(routineTask, seedRange));
  }

  return tasks
    .filter((task) => {
      if (!task.due_at) {
        const key = task.title.toLowerCase();
        if (!allowedTitles.has(key)) {
          return false;
        }
        if (removed.has(task.id)) {
          return false;
        }
      }
      return true;
    })
    .map((task) => {
      if (!task.due_at) {
        return updates.get(task.id) ?? task;
      }
      return task;
    });
};

export function useTasks() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [mealPreferences, setMealPreferences] = useState<MealPreferences>(DEFAULT_MEAL_PREFERENCES);
  const [selectedDate, setSelectedDate] = useState<Date>(() => startOfDay(new Date()));
  const [state, setState] = useState<TaskState>({
    loading: true,
    error: null,
    tasks: [],
  });
  const seedingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function syncPreferences() {
      if (!userId) {
        if (!cancelled) setMealPreferences(DEFAULT_MEAL_PREFERENCES);
        return;
      }

      try {
        const stored = await loadMealPreferences(userId);
        if (!cancelled) {
          setMealPreferences(stored ?? DEFAULT_MEAL_PREFERENCES);
        }
      } catch (error) {
        console.warn('Failed to load meal preferences', error);
        if (!cancelled) {
          setMealPreferences(DEFAULT_MEAL_PREFERENCES);
        }
      }
    }

    void syncPreferences();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const normalizedPreferences = useMemo(
    () => normalizeMealPreferences(mealPreferences),
    [mealPreferences],
  );

  const routineSeeds = useMemo(
    () => buildRoutineSeeds(normalizedPreferences),
    [normalizedPreferences],
  );

  const routineOrder = useMemo(() => {
    const map = new Map<string, number>();
    routineSeeds.forEach((seed, index) => {
      map.set(seed.title.toLowerCase(), index);
    });
    return map;
  }, [routineSeeds]);

  const routineRangeMap = useMemo(() => {
    const map = new Map<string, TimeRange>();
    routineSeeds.forEach((seed) => {
      map.set(seed.title.toLowerCase(), seedToRange(seed));
    });
    return map;
  }, [routineSeeds]);

  const getRoutineRange = useCallback(
    (task: Task): TimeRange => {
      const parsed = parseTimeRange(task.description ?? null);
      if (parsed) {
        return normalizeRange(parsed);
      }
      const fallback = routineRangeMap.get(task.title.toLowerCase());
      if (fallback) {
        return normalizeRange(fallback);
      }
      return normalizeRange({ startMinutes: 0, endMinutes: MINUTES_IN_DAY });
    },
    [routineRangeMap],
  );

  const allowedRoutineTitles = useMemo(() => {
    const set = new Set<string>();
    routineSeeds.forEach((seed) => set.add(seed.title.toLowerCase()));
    return set;
  }, [routineSeeds]);

  const comparator = useMemo(() => compareTasksFactory(routineOrder), [routineOrder]);
  const sortTaskList = useCallback((list: Task[]) => sortTasks(list, comparator), [comparator]);

  const range = useMemo(() => getRangeForDate(selectedDate), [selectedDate]);

  const adjustForSelectedDate = useCallback(
    (tasks: Task[]) =>
      sortTaskList(
        applyScheduleAdjustments(
          tasks,
          selectedDate,
          routineSeeds,
          routineRangeMap,
          FLEXIBLE_ROUTINE_TITLES,
          FOOD_ROUTINE_TITLES,
          allowedRoutineTitles,
        ),
      ),
    [selectedDate, routineSeeds, routineRangeMap, allowedRoutineTitles, sortTaskList],
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

        let nextTasks = [...existing];
        const routines = nextTasks.filter((task) => !task.due_at);
        const routineMap = new Map<string, Task>(
          routines.map((task) => [task.title.toLowerCase(), task]),
        );

        if (shouldUpgrade) {
          for (const routine of routines) {
            const titleKey = routine.title.toLowerCase();
            if (!allowedRoutineTitles.has(titleKey) && PREVIOUS_ROUTINE_TITLES.has(titleKey)) {
              try {
                await apiDeleteTask(routine.id);
                nextTasks = nextTasks.filter((task) => task.id !== routine.id);
                routineMap.delete(titleKey);
              } catch (error) {
                console.warn('Failed to remove legacy routine', routine.title, error);
              }
            }
          }
        }

        let changed = false;

        for (const seed of routineSeeds) {
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

          const updates: Parameters<typeof apiUpdateTask>[1] = {};
          let needsUpdate = false;

          const sanitizedCurrent = sanitizeDescription(current.description ?? '');
          const sanitizedSeed = sanitizeDescription(description);
          const currentRange = parseTimeRange(current.description ?? '');
          const seedRange = parseTimeRange(description);
          const hasCustomRange = Boolean(
            currentRange &&
              seedRange &&
              (currentRange.startMinutes !== seedRange.startMinutes ||
                currentRange.endMinutes !== seedRange.endMinutes),
          );

          if (!hasCustomRange && sanitizedCurrent === sanitizedSeed && !currentRange) {
            if ((current.description ?? '') !== description) {
              updates.description = description;
              needsUpdate = true;
            }
          }

          const desiredReminderIso = reminderDate ? reminderDate.toISOString() : null;
          const currentReminderIso = current.reminder_at ?? null;

          if (!hasCustomRange) {
            if (seed.reminder) {
              if (!isSameMinute(currentReminderIso, desiredReminderIso)) {
                updates.reminder_at = desiredReminderIso;
                needsUpdate = true;
              }
            } else if (currentReminderIso) {
              updates.reminder_at = null;
              needsUpdate = true;
            }
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
    [allowedRoutineTitles, routineSeeds],
  );

  const syncTaskReminders = useCallback(async (tasks: Task[]): Promise<Task[]> => {
    const updatedTasks = await Promise.all(
      tasks.map(async (task) => {
        try {
          if (!task.reminder_at) {
            await cancelTaskReminder(task.id);
            return task;
          }

          if (task.due_at && task.is_completed) {
            await cancelTaskReminder(task.id);
            return task;
          }

          const { task: normalizedTask, reminderDate } = await ensureRoutineReminderUpToDate(task);

          if (!normalizedTask.reminder_at || !reminderDate) {
            await cancelTaskReminder(normalizedTask.id);
            return { ...normalizedTask, reminder_at: null };
          }

          await scheduleTaskReminder(normalizedTask.id, normalizedTask.title, reminderDate, {
            repeatDaily: !normalizedTask.due_at,
          });

          return normalizedTask;
        } catch (error) {
          console.warn('Failed to sync reminder for task', task.id, error);
          return task;
        }
      }),
    );

    return updatedTasks;
  }, [ensureRoutineReminderUpToDate]);

  const refresh = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      let tasks = await apiFetchTasks({
        start: range.start.toISOString(),
        end: range.end.toISOString(),
        includeCompleted: true,
      });
      tasks = await ensureDefaultRoutines(tasks);
      tasks = await syncTaskReminders(tasks);
      const sorted = sortTaskList(tasks);
      setState({ loading: false, error: null, tasks: sorted });
      const adjusted = adjustForSelectedDate(sorted);
      await scheduleDailySummary(countActiveTasks(adjusted));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load tasks';
      setState((prev) => ({ ...prev, loading: false, error: message }));
    }
  }, [ensureDefaultRoutines, range, sortTaskList, adjustForSelectedDate, syncTaskReminders]);

  useEffect(() => {
    refresh().catch((err) => console.warn('Failed to fetch tasks', err));
    return () => {
      cancelDailySummary().catch(() => undefined);
    };
  }, [refresh]);

  const applyTaskUpdate = useCallback(
    async (task: Task): Promise<Task[]> => {
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

        updated = sortTaskList(updated);
        nextTasks = updated;
        return { ...prev, tasks: updated };
      });

      if (shouldUpdateSummary) {
        const adjusted = adjustForSelectedDate(nextTasks);
        await scheduleDailySummary(countActiveTasks(adjusted));
      }

      return nextTasks;
    },
    [range, sortTaskList, adjustForSelectedDate],
  );

  const applyTaskDeletion = useCallback(
    async (taskId: string) => {
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
        const updated = sortTaskList(filtered);
        nextTasks = updated;
        return { ...prev, tasks: updated };
      });

      if (removed) {
        const adjusted = adjustForSelectedDate(nextTasks);
        await scheduleDailySummary(countActiveTasks(adjusted));
      }
    },
    [sortTaskList, adjustForSelectedDate],
  );

  const handleCreateTask = useCallback(
    async (payload: Parameters<typeof apiCreateTask>[0]) => {
      let requestPayload = payload;

      if (payload.reminder_at && payload.due_at === null) {
        const nextReminderDate = computeNextDailyReminderDate(payload.reminder_at);
        requestPayload = {
          ...payload,
          reminder_at: nextReminderDate ? nextReminderDate.toISOString() : payload.reminder_at,
        };
      }

      let task = await apiCreateTask(requestPayload);
      const { task: normalizedTask, reminderDate } = await ensureRoutineReminderUpToDate(task);
      task = normalizedTask;

      if (task.reminder_at && reminderDate) {
        try {
          await scheduleTaskReminder(task.id, task.title, reminderDate, {
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
    [applyTaskUpdate, ensureRoutineReminderUpToDate],
  );

  const handleUpdateTask = useCallback(
    async (
      taskId: string,
      payload: Parameters<typeof apiUpdateTask>[1],
      options?: {
        skipCascade?: boolean;
      },
    ) => {
      let requestPayload = payload;

      if ('reminder_at' in payload && payload.reminder_at) {
        let isRoutineUpdate = false;

        if ('due_at' in payload) {
          isRoutineUpdate = payload.due_at === null;
        } else {
          const existingTask = state.tasks.find((item) => item.id === taskId);
          isRoutineUpdate = existingTask ? isRoutineTask(existingTask) : false;
        }

        if (isRoutineUpdate) {
          const nextReminderDate = computeNextDailyReminderDate(payload.reminder_at);
          requestPayload = {
            ...payload,
            reminder_at: nextReminderDate ? nextReminderDate.toISOString() : payload.reminder_at,
          };
        }
      }

      let task = await apiUpdateTask(taskId, requestPayload);
      const { task: normalizedTask, reminderDate } = await ensureRoutineReminderUpToDate(task);
      task = normalizedTask;

      if (task.reminder_at && reminderDate) {
        try {
          await scheduleTaskReminder(task.id, task.title, reminderDate, {
            repeatDaily: !task.due_at,
          });
        } catch (error) {
          console.warn('Failed to schedule reminder', task.id, error);
        }
      } else {
        await cancelTaskReminder(task.id);
      }

      const updatedList = await applyTaskUpdate(task);

      const skipCascade = options?.skipCascade ?? false;

      if (!skipCascade && task.due_at === null) {
        const routines = updatedList
          .filter((item) => !item.due_at)
          .sort((a, b) => {
            const orderA = routineOrder.get(a.title.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
            const orderB = routineOrder.get(b.title.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
            return orderA - orderB;
          });

        const sourceIndex = routines.findIndex((item) => item.id === task.id);
        if (sourceIndex !== -1) {
          const sourceRange = getRoutineRange(task);
          let boundaryIndex = -1;

          for (let i = sourceIndex + 1; i < routines.length; i += 1) {
            const key = routines[i].title.toLowerCase();
            if (ANCHOR_ROUTINE_TITLES.has(key)) {
              boundaryIndex = i;
              break;
            }
          }

          if (boundaryIndex !== -1) {
            const boundaryTask = routines[boundaryIndex];
            const boundaryRange = getRoutineRange(boundaryTask);
            const boundaryStart = Math.round(boundaryRange.startMinutes);
            const targets = routines.slice(sourceIndex + 1, boundaryIndex);

            if (targets.length > 0) {
              const adjustments: Array<{ task: Task; range: TimeRange }> = [];
              let cursor = Math.min(Math.round(sourceRange.endMinutes), boundaryStart);

              for (let idx = 0; idx < targets.length; idx += 1) {
                const target = targets[idx];
                const normalizedTarget = getRoutineRange(target);
                const originalDuration = Math.max(
                  MIN_ROUTINE_MINUTES,
                  Math.round(normalizedTarget.endMinutes - normalizedTarget.startMinutes),
                );

                const availableNow = boundaryStart - cursor;
                if (availableNow <= 0) {
                  break;
                }

                const remaining = targets.length - idx - 1;
                const minRequiredForRest = MIN_ROUTINE_MINUTES * remaining;

                let maxForCurrent = availableNow;
                if (remaining > 0) {
                  maxForCurrent = Math.max(MIN_ROUTINE_MINUTES, availableNow - minRequiredForRest);
                }
                maxForCurrent = Math.min(maxForCurrent, availableNow);

                let allocated = Math.min(originalDuration, maxForCurrent);
                const minAllowable = Math.min(MIN_ROUTINE_MINUTES, availableNow);
                if (allocated < minAllowable) {
                  allocated = minAllowable;
                }

                const startMinutes = cursor;
                let endMinutes = startMinutes + allocated;
                if (endMinutes > boundaryStart) {
                  endMinutes = boundaryStart;
                }

                cursor = endMinutes;
                adjustments.push({
                  task: target,
                  range: {
                    startMinutes: Math.floor(startMinutes),
                    endMinutes: Math.ceil(endMinutes),
                  },
                });
              }

              if (adjustments.length > 0) {
                const lastAdjustment = adjustments[adjustments.length - 1];
                if (lastAdjustment.range.endMinutes < boundaryStart) {
                  lastAdjustment.range.endMinutes = boundaryStart;
                }

                for (const adjustment of adjustments) {
                  const currentRange = getRoutineRange(adjustment.task);
                  if (
                    Math.round(currentRange.startMinutes) === adjustment.range.startMinutes &&
                    Math.round(currentRange.endMinutes) === adjustment.range.endMinutes
                  ) {
                    continue;
                  }

                  const baseDescription = stripTimeMetadata(adjustment.task.description ?? '');
                  if (adjustment.range.endMinutes <= adjustment.range.startMinutes) {
                    continue;
                  }

                  const normalizedRange = normalizeRange({
                    startMinutes: adjustment.range.startMinutes,
                    endMinutes: adjustment.range.endMinutes,
                  });

                  const updatedDescription = injectTimeMetadata(baseDescription, normalizedRange);
                  const updatePayload: Parameters<typeof apiUpdateTask>[1] = {
                    description: updatedDescription,
                  };

                  if (adjustment.task.reminder_at) {
                    const reminderDate = new Date(adjustment.task.reminder_at);
                    if (!Number.isNaN(reminderDate.getTime())) {
                      const previousRange = normalizeRange(currentRange);
                      const prevStartMinute = Math.round(previousRange.startMinutes) % MINUTES_IN_DAY;
                      const reminderMinute = reminderDate.getHours() * 60 + reminderDate.getMinutes();
                      if (prevStartMinute === reminderMinute) {
                        const anchor = startOfDay(new Date());
                        const nextReminderDate = minutesToDate(normalizedRange.startMinutes, anchor);
                        updatePayload.reminder_at = nextReminderDate.toISOString();
                      }
                    }
                  }

                  await handleUpdateTask(adjustment.task.id, updatePayload, { skipCascade: true });
                }
              }
            }
          }
        }
      }

      return task;
    },
    [
      applyTaskUpdate,
      ensureRoutineReminderUpToDate,
      state.tasks,
      routineOrder,
      getRoutineRange,
    ],
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
