import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TaskCalendar } from '@/components/tasks/task-calendar';
import { TaskFormModal, type TaskFormValues } from '@/components/tasks/task-form-modal';
import { TaskList } from '@/components/tasks/task-list';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/contexts/AuthContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useTasks } from '@/hooks/useTasks';
import { requestNotificationPermissions } from '@/lib/notifications';
import type { Task } from '@/types/task';
import { startOfDay } from '@/utils/dates';

export default function HomeScreen() {
  const { user, signOut } = useAuth();
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

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to sign out';
      Alert.alert('Sign out failed', message);
    }
  };

  const openCreateModal = (mode: 'task' | 'routine') => {
    setSelectedTask(null);
    setFormMode(mode);
    setModalVisible(true);
  };

  const openEditModal = (task: Task) => {
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
    await toggleComplete(task.id, !task.is_completed);
  };

  const handleDeleteTask = async (task: Task) => {
    await deleteTask(task.id);
  };

  useEffect(() => {
    requestNotificationPermissions().catch((err) =>
      console.warn('Notification permissions request failed', err),
    );
  }, []);

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
          selectedDate={selectedDate}
        />

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

        <TaskFormModal
          visible={isModalVisible}
          onClose={() => setModalVisible(false)}
          onSubmit={handleSubmit}
          submitting={submitting}
          task={selectedTask}
          selectedDate={selectedTask?.due_at ? startOfDay(new Date(selectedTask.due_at)) : selectedDate}
          mode={formMode}
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
