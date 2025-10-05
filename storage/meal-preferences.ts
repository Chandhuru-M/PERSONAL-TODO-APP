import AsyncStorage from '@react-native-async-storage/async-storage';

export interface MealPreferences {
  breakfastStart: number;
  lunchStart: number;
  dinnerStart: number;
}

export const DEFAULT_MEAL_PREFERENCES: MealPreferences = {
  breakfastStart: 8 * 60,
  lunchStart: 14 * 60,
  dinnerStart: 20 * 60,
};

const STORAGE_KEY_PREFIX = 'meal-preferences';

const clampMinutes = (value: number, fallback: number): number => {
  if (!Number.isFinite(value)) return fallback;
  if (value < 0) return (value % (24 * 60) + 24 * 60) % (24 * 60);
  return value % (24 * 60);
};

export async function saveMealPreferences(userId: string, prefs: MealPreferences): Promise<void> {
  const key = buildPreferencesKey(userId);
  const payload = {
    breakfastStart: clampMinutes(prefs.breakfastStart, DEFAULT_MEAL_PREFERENCES.breakfastStart),
    lunchStart: clampMinutes(prefs.lunchStart, DEFAULT_MEAL_PREFERENCES.lunchStart),
    dinnerStart: clampMinutes(prefs.dinnerStart, DEFAULT_MEAL_PREFERENCES.dinnerStart),
  } satisfies MealPreferences;
  await AsyncStorage.setItem(key, JSON.stringify(payload));
}

export async function loadMealPreferences(userId: string): Promise<MealPreferences | null> {
  const key = buildPreferencesKey(userId);
  const stored = await AsyncStorage.getItem(key);
  if (!stored) return null;

  try {
    const parsed = JSON.parse(stored) as Partial<MealPreferences> | null;
    if (!parsed) return null;
    return {
      breakfastStart: clampMinutes(parsed.breakfastStart ?? DEFAULT_MEAL_PREFERENCES.breakfastStart, DEFAULT_MEAL_PREFERENCES.breakfastStart),
      lunchStart: clampMinutes(parsed.lunchStart ?? DEFAULT_MEAL_PREFERENCES.lunchStart, DEFAULT_MEAL_PREFERENCES.lunchStart),
      dinnerStart: clampMinutes(parsed.dinnerStart ?? DEFAULT_MEAL_PREFERENCES.dinnerStart, DEFAULT_MEAL_PREFERENCES.dinnerStart),
    };
  } catch (error) {
    console.warn('Failed to parse meal preferences, resetting', error);
    await AsyncStorage.removeItem(key);
    return null;
  }
}

export async function clearMealPreferences(userId: string): Promise<void> {
  await AsyncStorage.removeItem(buildPreferencesKey(userId));
}

function buildPreferencesKey(userId: string): string {
  return `${STORAGE_KEY_PREFIX}:${userId}`;
}
