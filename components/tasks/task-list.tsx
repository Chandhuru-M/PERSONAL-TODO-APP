import { FlatList, RefreshControl, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import type { Task } from '@/types/task';
import { formatDate } from '@/utils/dates';
import { TaskItem } from './task-item';

interface TaskListProps {
  tasks: Task[];
  loading: boolean;
  error?: string | null;
  onRefresh: () => void;
  onToggleComplete: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onAdjustTime?: (task: Task) => void;
  selectedDate: Date;
  readOnly?: boolean;
}

export function TaskList({
  tasks,
  loading,
  error,
  onRefresh,
  onToggleComplete,
  onEdit,
  onDelete,
  onAdjustTime,
  selectedDate,
  readOnly = false,
}: TaskListProps) {
  const dayLabel = formatDate(selectedDate, { weekday: 'long' }) ?? 'that day';
  const displayedTasks = readOnly
    ? tasks.filter((task) => task.is_completed && task.due_at)
    : tasks;
  const emptyMessage = readOnly
    ? `No completed tasks recorded for ${dayLabel}.`
    : `You haven't planned anything for ${dayLabel}. Use the buttons below to add a task or a daily routine.`;
  return (
    <FlatList
      data={displayedTasks}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.listContent}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} />}
      renderItem={({ item }) => (
        <TaskItem
          task={item}
          onToggleComplete={readOnly ? undefined : onToggleComplete}
          onEdit={readOnly ? undefined : onEdit}
          onDelete={readOnly ? undefined : onDelete}
          onAdjustTime={readOnly ? undefined : onAdjustTime}
          readOnly={readOnly}
        />
      )}
      ListEmptyComponent={
        !loading ? (
          <ThemedView style={styles.emptyState}>
            {error ? (
              <>
                <ThemedText type="subtitle">We ran into an issue</ThemedText>
                <ThemedText>{error}</ThemedText>
              </>
            ) : (
              <>
                <ThemedText type="subtitle">Nothing scheduled</ThemedText>
                <ThemedText>{emptyMessage}</ThemedText>
              </>
            )}
          </ThemedView>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingBottom: 120,
  },
  emptyState: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 48,
  },
});
