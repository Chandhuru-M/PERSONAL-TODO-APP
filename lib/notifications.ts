import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SchedulableNotificationTriggerInput } from 'expo-notifications';
import * as Notifications from 'expo-notifications';
import { SchedulableTriggerInputTypes } from 'expo-notifications';
import { Platform } from 'react-native';

const REMINDER_STORAGE_KEY = 'todo-reminder-map';
const SUMMARY_STORAGE_KEY = 'todo-daily-summary-id';
const REMINDER_CHANNEL_ID = 'reminders';
const SUMMARY_CHANNEL_ID = 'daily-summaries';

interface ReminderMap {
  [taskId: string]: string;
}

async function ensurePermissionsAsync(): Promise<boolean> {
  const settings = await Notifications.getPermissionsAsync();
  if (settings.granted || settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
    await configureAndroidChannels();
    return true;
  }

  const request = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
    },
  });

  const granted = request.granted || request.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  if (granted) {
    await configureAndroidChannels();
  }
  return granted;
}

async function configureAndroidChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
    name: 'Task reminders',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    enableVibrate: true,
  });

  await Notifications.setNotificationChannelAsync(SUMMARY_CHANNEL_ID, {
    name: 'Daily summaries',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'default',
  });
}

async function readReminderMap(): Promise<ReminderMap> {
  const stored = await AsyncStorage.getItem(REMINDER_STORAGE_KEY);
  if (!stored) return {};

  try {
    return JSON.parse(stored) as ReminderMap;
  } catch (error) {
    console.warn('Failed to parse reminder store, resetting', error);
    await AsyncStorage.removeItem(REMINDER_STORAGE_KEY);
    return {};
  }
}

async function writeReminderMap(map: ReminderMap): Promise<void> {
  await AsyncStorage.setItem(REMINDER_STORAGE_KEY, JSON.stringify(map));
}

export async function requestNotificationPermissions(): Promise<boolean> {
  return ensurePermissionsAsync();
}

export async function scheduleTaskReminder(
  taskId: string,
  title: string,
  reminderDate: Date,
): Promise<void> {
  const permitted = await ensurePermissionsAsync();
  if (!permitted) {
    throw new Error('Notifications permission not granted');
  }

  if (reminderDate.getTime() <= Date.now()) {
    console.warn('Skipping reminder scheduling in the past');
    return;
  }

  await cancelTaskReminder(taskId);

  const trigger: SchedulableNotificationTriggerInput = {
    type: SchedulableTriggerInputTypes.DATE,
    date: reminderDate,
    ...(Platform.OS === 'android' ? { channelId: REMINDER_CHANNEL_ID } : {}),
  };

  const notificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Task reminder',
      body: title,
      sound: Platform.select({ ios: 'default', android: 'default' }),
      data: { taskId },
    },
    trigger,
  });

  const reminderMap = await readReminderMap();
  reminderMap[taskId] = notificationId;
  await writeReminderMap(reminderMap);
}

export async function cancelTaskReminder(taskId: string): Promise<void> {
  const reminderMap = await readReminderMap();
  const notificationId = reminderMap[taskId];
  if (notificationId) {
    try {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
    } catch (error) {
      console.warn('Failed to cancel notification', error);
    }
    delete reminderMap[taskId];
    await writeReminderMap(reminderMap);
  }
}

export async function scheduleDailySummary(count: number): Promise<void> {
  const permitted = await ensurePermissionsAsync();
  if (!permitted) return;

  await cancelDailySummary();

  const triggerDate = getNextEightAm();

  const summaryBody =
    count > 0
      ? `You have ${count} task${count === 1 ? '' : 's'} scheduled for today. Tap to review!`
      : "You're all caught up! Review today's plan anyway?";

  const trigger: SchedulableNotificationTriggerInput = {
    type: SchedulableTriggerInputTypes.DATE,
    date: triggerDate,
    ...(Platform.OS === 'android' ? { channelId: SUMMARY_CHANNEL_ID } : {}),
  };

  const notificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Today\'s plan',
      body: summaryBody,
      sound: Platform.select({ ios: 'default', android: 'default' }),
      data: { type: 'daily-summary' },
    },
    trigger,
  });

  await AsyncStorage.setItem(SUMMARY_STORAGE_KEY, notificationId);
}

export async function cancelDailySummary(): Promise<void> {
  const stored = await AsyncStorage.getItem(SUMMARY_STORAGE_KEY);
  if (stored) {
    try {
      await Notifications.cancelScheduledNotificationAsync(stored);
    } catch (error) {
      console.warn('Failed to cancel summary notification', error);
    }
    await AsyncStorage.removeItem(SUMMARY_STORAGE_KEY);
  }
}

export function getNextEightAm(baseDate: Date = new Date()): Date {
  const trigger = new Date(baseDate);
  trigger.setHours(8, 0, 0, 0);
  if (trigger <= baseDate) {
    trigger.setDate(trigger.getDate() + 1);
  }
  return trigger;
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});
