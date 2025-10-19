import { MaterialIcons } from '@expo/vector-icons';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TaskFormModal, type TaskFormValues } from '@/components/tasks/task-form-modal';
import { TaskTimeModal } from '@/components/tasks/task-time-modal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useTasks } from '@/hooks/useTasks';
import type { Task } from '@/types/task';
import { formatTime, startOfDay } from '@/utils/dates';
import {
    datesToTimeRange,
    injectTimeMetadata,
    minutesToDate,
    parseTimeRange,
    stripTimeMetadata,
    timeRangeToFriendly,
} from '@/utils/time-range';

export default function RoutinesScreen() {
  const surface = useThemeColor({}, 'surface');
  const background = useThemeColor({}, 'background');
  const border = useThemeColor({}, 'border');
  const tint = useThemeColor({}, 'tint');
  const muted = useThemeColor({}, 'muted');
  const danger = useThemeColor({}, 'danger');

  const { tasks, loading, error, refresh, createTask, updateTask, deleteTask } = useTasks();

  const routines = useMemo(() => tasks.filter((task) => !task.due_at), [tasks]);
  const anchorDate = useMemo(() => startOfDay(new Date()), []);

  const [formVisible, setFormVisible] = useState(false);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [selectedRoutine, setSelectedRoutine] = useState<Task | null>(null);

  const [timeModalVisible, setTimeModalVisible] = useState(false);
  const [timeSubmitting, setTimeSubmitting] = useState(false);
  const [timeRoutine, setTimeRoutine] = useState<Task | null>(null);

  const openCreateModal = () => {
    setSelectedRoutine(null);
    setFormVisible(true);
  };

  const openEditModal = (task: Task) => {
    setSelectedRoutine(task);
    setFormVisible(true);
  };

  const handleSubmit = useCallback(
    async (values: TaskFormValues, existingTask?: Task) => {
      setFormSubmitting(true);
      try {
        if (existingTask) {
          await updateTask(existingTask.id, values);
        } else {
          await createTask(values);
        }
      } finally {
        setFormSubmitting(false);
      }
    },
    [createTask, updateTask],
  );

  const openTimeModal = (task: Task) => {
    setTimeRoutine(task);
    setTimeModalVisible(true);
  };

  const closeTimeModal = () => {
    setTimeModalVisible(false);
    setTimeRoutine(null);
  };

  const computeTimeDefaults = useCallback(
    (task: Task | null) => {
      const fallbackStart = new Date(anchorDate);
      fallbackStart.setHours(9, 0, 0, 0);
      const fallbackEnd = new Date(fallbackStart);
      fallbackEnd.setMinutes(fallbackEnd.getMinutes() + 60);

      if (!task) {
        return { start: fallbackStart, end: fallbackEnd };
      }

      const parsed = parseTimeRange(task.description ?? null);
      if (!parsed) {
        return { start: fallbackStart, end: fallbackEnd };
      }

      return {
        start: minutesToDate(parsed.startMinutes, anchorDate),
        end: minutesToDate(parsed.endMinutes, anchorDate),
      };
    },
    [anchorDate],
  );

  const { start: initialStart, end: initialEnd } = useMemo(
    () => computeTimeDefaults(timeRoutine),
    [computeTimeDefaults, timeRoutine],
  );

  const handleSubmitTime = useCallback(
    async ({ start, end }: { start: Date; end: Date }) => {
      if (!timeRoutine) return;

      setTimeSubmitting(true);
      try {
        const baseDescription = stripTimeMetadata(timeRoutine.description ?? '');
        const range = datesToTimeRange(start, end);
        const updates: Parameters<typeof updateTask>[1] = {
          description: injectTimeMetadata(baseDescription, range),
        };

        if (timeRoutine.reminder_at) {
          const previousRange = parseTimeRange(timeRoutine.description ?? '');
          const reminderDate = new Date(timeRoutine.reminder_at);
          if (previousRange && !Number.isNaN(reminderDate.getTime())) {
            const prevStart = minutesToDate(previousRange.startMinutes, anchorDate);
            const prevReminderMinute = Math.floor(reminderDate.getTime() / 60000);
            const prevStartMinute = Math.floor(prevStart.getTime() / 60000);
            if (prevReminderMinute === prevStartMinute) {
              updates.reminder_at = new Date(start).toISOString();
            }
          }
        }

        await updateTask(timeRoutine.id, updates);
        closeTimeModal();
      } finally {
        setTimeSubmitting(false);
      }
    },
    [anchorDate, timeRoutine, updateTask],
  );

  const handleDelete = (task: Task) => {
    Alert.alert(
      'Delete routine?',
      `This will remove "${task.title}" from your daily schedule.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void deleteTask(task.id);
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: background }]}
      edges={['top', 'bottom']}
    >
      <ThemedView style={[styles.container, { backgroundColor: surface }]}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={() => {
                void refresh();
              }}
            />
          }
        >
          <View style={styles.header}>
            <View>
              <ThemedText type="title">Daily routines</ThemedText>
              <ThemedText style={{ color: muted }}>
                Adjust recurring schedule blocks and reminders.
              </ThemedText>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={openCreateModal}
              style={[styles.iconButton, { borderColor: tint }]}
            >
              <MaterialIcons name="add" size={24} color={tint} />
            </Pressable>
          </View>

          {error ? (
            <ThemedView style={[styles.errorCard, { borderColor: border }]}>
              <ThemedText type="subtitle">We ran into an issue</ThemedText>
              <ThemedText>{error}</ThemedText>
            </ThemedView>
          ) : null}

          {routines.length === 0 && !loading ? (
            <ThemedView style={[styles.emptyState, { borderColor: border }]}>
              <ThemedText type="subtitle">No routines yet</ThemedText>
              <ThemedText style={{ color: muted }}>
                Tap the plus button to add your first daily routine.
              </ThemedText>
            </ThemedView>
          ) : null}

          {routines.map((routine) => {
            const parsed = parseTimeRange(routine.description ?? null);
            const timeLabel = parsed ? timeRangeToFriendly(parsed) : 'No time set';
            const summary = stripTimeMetadata(routine.description ?? '').trim();
            const reminderLabel =
              routine.reminder_at && formatTime(routine.reminder_at)
                ? `Reminder ${formatTime(routine.reminder_at)}`
                : 'No reminder';

            return (
              <ThemedView key={routine.id} style={[styles.card, { borderColor: border }]}>
                <View style={styles.cardHeader}>
                  <ThemedText type="subtitle" style={styles.cardTitle}>
                    {routine.title}
                  </ThemedText>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.cardActions}
                  >
                    <Pressable
                      accessibilityRole="button"
                      style={[styles.secondaryButton, { borderColor: border }]}
                      onPress={() => openTimeModal(routine)}
                    >
                      <MaterialIcons name="schedule" size={18} color={tint} />
                      <ThemedText style={{ color: tint }}>Adjust time</ThemedText>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      style={[styles.secondaryButton, { borderColor: border }]}
                      onPress={() => openEditModal(routine)}
                    >
                      <MaterialIcons name="edit" size={18} color={tint} />
                      <ThemedText style={{ color: tint }}>Edit details</ThemedText>
                    </Pressable>
                  </ScrollView>
                </View>
                <ThemedText style={[styles.metaText, { color: muted }]}>{timeLabel}</ThemedText>
                {summary ? <ThemedText>{summary}</ThemedText> : null}
                <View style={styles.cardFooter}>
                  <ThemedText style={[styles.metaText, { color: muted }]}>{reminderLabel}</ThemedText>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => handleDelete(routine)}
                    style={[styles.deleteButton, { borderColor: border }]}
                  >
                    <MaterialIcons name="delete-outline" size={18} color={danger} />
                    <ThemedText style={{ color: danger }}>Delete</ThemedText>
                  </Pressable>
                </View>
              </ThemedView>
            );
          })}
        </ScrollView>
      </ThemedView>

      <TaskFormModal
        visible={formVisible}
        onClose={() => setFormVisible(false)}
        onSubmit={handleSubmit}
        submitting={formSubmitting}
        task={selectedRoutine}
        selectedDate={anchorDate}
        mode="routine"
      />

      <TaskTimeModal
        visible={timeModalVisible && Boolean(timeRoutine)}
        onClose={closeTimeModal}
        onSubmit={handleSubmitTime}
        taskTitle={timeRoutine?.title ?? ''}
        anchorDate={anchorDate}
        initialStart={initialStart}
        initialEnd={initialEnd}
        submitting={timeSubmitting}
      />
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
  scrollContent: {
    paddingBottom: 120,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  cardHeader: {
    flexDirection: 'column',
    gap: 12,
  },
  cardTitle: {
    flexShrink: 0,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 12,
  },
  secondaryButton: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  metaText: {
    fontSize: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  deleteButton: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderRadius: 999,
  },
  errorCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    gap: 4,
  },
  emptyState: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 24,
    gap: 8,
    alignItems: 'center',
  },
});
