import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TaskCalendar } from '@/components/tasks/task-calendar';
import { TaskFormModal, type TaskFormValues } from '@/components/tasks/task-form-modal';
import { TaskList } from '@/components/tasks/task-list';
import { TaskTimeModal } from '@/components/tasks/task-time-modal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/contexts/AuthContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useTasks } from '@/hooks/useTasks';
import { requestNotificationPermissions } from '@/lib/notifications';
import type { Task } from '@/types/task';
import { startOfDay } from '@/utils/dates';
import {
    datesToTimeRange,
    injectTimeMetadata,
    minutesToDate,
    parseTimeRange,
    stripTimeMetadata,
} from '@/utils/time-range';

export default function HomeScreen() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const background = useThemeColor({}, 'background');
  const surface = useThemeColor({}, 'surface');
  const accent = useThemeColor({}, 'tint');
  const muted = useThemeColor({}, 'muted');
  const onAccent = useThemeColor({}, 'onTint');
  const {
    selectedDate,
    setSelectedDate,
    tasks,
    loading,
    error,
    refresh,
    createTask,
    updateTask,
    toggleComplete,
    deleteTask,
  } = useTasks();

  const [isModalVisible, setModalVisible] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formMode, setFormMode] = useState<'task' | 'routine'>('task');
  const [lastSelectableDate, setLastSelectableDate] = useState<Date>(selectedDate);
  const [timeEditorTask, setTimeEditorTask] = useState<Task | null>(null);
  const [isTimeModalVisible, setTimeModalVisible] = useState(false);
  const [timeSubmitting, setTimeSubmitting] = useState(false);

  const today = startOfDay(new Date());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const isHistoricalDay = selectedDate < yesterday;
  const hasCompletedHistory = tasks.some((task) => task.is_completed && task.due_at);

  useEffect(() => {
    if (loading) {
      return;
    }

    if (isHistoricalDay && !hasCompletedHistory) {
      if (selectedDate.getTime() !== lastSelectableDate.getTime()) {
        setSelectedDate(lastSelectableDate);
      }
      return;
    }

    setLastSelectableDate(selectedDate);
  }, [
    isHistoricalDay,
    hasCompletedHistory,
    selectedDate,
    lastSelectableDate,
    setSelectedDate,
    loading,
  ]);

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to sign out';
      Alert.alert('Sign out failed', message);
    }
  };

  const openCreateModal = (mode: 'task' | 'routine') => {
    if (isHistoricalDay) {
      Alert.alert('Read-only day', 'You can only view completed tasks for previous days.');
      return;
    }
    if (mode === 'routine') {
      router.push('/routines' as never);
      return;
    }
    setSelectedTask(null);
    setFormMode(mode);
    setModalVisible(true);
  };

  const openEditModal = (task: Task) => {
    if (isHistoricalDay) {
      Alert.alert('Read-only day', 'You can only view completed tasks for previous days.');
      return;
    }
    setSelectedTask(task);
    if (task.due_at) {
      setSelectedDate(startOfDay(new Date(task.due_at)));
      setFormMode('task');
    } else {
      setFormMode('routine');
    }
    setModalVisible(true);
  };

  const handleSubmit = async (values: TaskFormValues, existingTask?: Task) => {
    try {
      setSubmitting(true);
      if (existingTask) {
        await updateTask(existingTask.id, values);
      } else {
        await createTask(values);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleComplete = async (task: Task) => {
    if (isHistoricalDay) return;
    await toggleComplete(task.id, !task.is_completed);
  };

  const handleDeleteTask = async (task: Task) => {
    if (isHistoricalDay) return;
    await deleteTask(task.id);
  };

  const defaultTimeRange = (anchor: Date) => {
    const start = new Date(anchor);
    start.setHours(9, 0, 0, 0);
    const end = new Date(start);
    end.setMinutes(end.getMinutes() + 60);
    return { start, end };
  };

  const resolveAnchorDate = (task: Task | null) => {
    if (task?.due_at) {
      return startOfDay(new Date(task.due_at));
    }
    return startOfDay(selectedDate);
  };

  const computeInitialTimes = (task: Task | null) => {
    const anchor = resolveAnchorDate(task);
    if (!task) {
      return { anchor, ...defaultTimeRange(anchor) };
    }
    const parsed = parseTimeRange(task.description ?? '');
    if (!parsed) {
      return { anchor, ...defaultTimeRange(anchor) };
    }
    return {
      anchor,
      start: minutesToDate(parsed.startMinutes, anchor),
      end: minutesToDate(parsed.endMinutes, anchor),
    };
  };

  const handleAdjustTime = (task: Task) => {
    if (!task.due_at || isHistoricalDay) {
      return;
    }
    setTimeEditorTask(task);
    setTimeModalVisible(true);
  };

  const handleSubmitTime = async ({ start, end }: { start: Date; end: Date }) => {
    if (!timeEditorTask) return;
    setTimeSubmitting(true);
    try {
      const anchor = resolveAnchorDate(timeEditorTask);
      const baseDescription = stripTimeMetadata(timeEditorTask.description ?? '');
      const range = datesToTimeRange(start, end);

      const updates: Parameters<typeof updateTask>[1] = {
        description: injectTimeMetadata(baseDescription, range),
      };

      if (timeEditorTask.reminder_at) {
        const previousRange = parseTimeRange(timeEditorTask.description ?? '');
        const reminderDate = new Date(timeEditorTask.reminder_at);
        if (previousRange && !Number.isNaN(reminderDate.getTime())) {
          const prevStart = minutesToDate(previousRange.startMinutes, anchor);
          const prevReminderMinute = Math.floor(reminderDate.getTime() / 60000);
          const prevStartMinute = Math.floor(prevStart.getTime() / 60000);
          if (prevStartMinute === prevReminderMinute) {
            updates.reminder_at = new Date(start).toISOString();
          }
        }
      }

      await updateTask(timeEditorTask.id, updates);
      setTimeModalVisible(false);
      setTimeEditorTask(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update timing';
      Alert.alert('Update failed', message);
    } finally {
      setTimeSubmitting(false);
    }
  };

  const closeTimeModal = () => {
    setTimeModalVisible(false);
    setTimeEditorTask(null);
  };

  useEffect(() => {
    requestNotificationPermissions().catch((err) =>
      console.warn('Notification permissions request failed', err),
    );
  }, []);

  const { anchor: timeAnchor, start: initialStart, end: initialEnd } = computeInitialTimes(
    timeEditorTask,
  );

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: background }]}
      edges={['top', 'left', 'right']}
    >
      <ThemedView lightColor={surface} darkColor={surface} style={styles.container}>
        <View style={styles.header}>
          <View>
            <ThemedText type="title">Today&apos;s focus</ThemedText>
            <ThemedText style={[styles.subtitle, { color: muted }]}>
              {user ? `Logged in as ${user.email}` : 'Plan your tasks and stay on track.'}
            </ThemedText>
          </View>
          <Pressable onPress={handleSignOut} accessibilityRole="button">
            <MaterialIcons name="logout" size={24} color={accent} />
          </Pressable>
        </View>

        <TaskCalendar selectedDate={selectedDate} onSelectDate={setSelectedDate} />

        <TaskList
          tasks={tasks}
          loading={loading}
          error={error}
          onRefresh={() => {
            void refresh();
          }}
          onToggleComplete={handleToggleComplete}
          onEdit={openEditModal}
          onDelete={handleDeleteTask}
          onAdjustTime={handleAdjustTime}
          selectedDate={selectedDate}
          readOnly={isHistoricalDay}
        />

        {!isHistoricalDay ? (
          <View style={styles.fabStack}>
            <Pressable
              style={[styles.fab, styles.secondaryFab, { borderColor: accent }]}
              onPress={() => openCreateModal('routine')}
              accessibilityRole="button"
            >
              <MaterialIcons name="repeat" size={24} color={accent} />
              <ThemedText style={[styles.fabLabel, { color: accent }]}>Routine</ThemedText>
            </Pressable>
            <Pressable
              style={[styles.fab, { backgroundColor: accent }]}
              onPress={() => openCreateModal('task')}
              accessibilityRole="button"
            >
              <MaterialIcons name="add" size={28} color={onAccent} />
              <ThemedText style={[styles.fabLabel, { color: onAccent }]}>Task</ThemedText>
            </Pressable>
          </View>
        ) : null}

        <TaskFormModal
          visible={isModalVisible}
          onClose={() => setModalVisible(false)}
          onSubmit={handleSubmit}
          submitting={submitting}
          task={selectedTask}
          selectedDate={selectedTask?.due_at ? startOfDay(new Date(selectedTask.due_at)) : selectedDate}
          mode={formMode}
        />
        <TaskTimeModal
          visible={isTimeModalVisible && Boolean(timeEditorTask)}
          onClose={closeTimeModal}
          onSubmit={handleSubmitTime}
          taskTitle={timeEditorTask?.title ?? ''}
          anchorDate={timeAnchor}
          initialStart={initialStart}
          initialEnd={initialEnd}
          submitting={timeSubmitting}
        />
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  subtitle: {
    opacity: 0.7,
  },
  fabStack: {
    position: 'absolute',
    right: 24,
    bottom: 32,
    gap: 12,
  },
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  fabLabel: {
    fontWeight: '600',
  },
  secondaryFab: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
});
