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
  selectedDate: Date;
}

export function TaskList({
  tasks,
  loading,
  error,
  onRefresh,
  onToggleComplete,
  onEdit,
  onDelete,
  selectedDate,
}: TaskListProps) {
  const dayLabel = formatDate(selectedDate, { weekday: 'long' }) ?? 'that day';
  return (
    <FlatList
      data={tasks}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.listContent}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} />}
      renderItem={({ item }) => (
        <TaskItem task={item} onToggleComplete={onToggleComplete} onEdit={onEdit} onDelete={onDelete} />
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
                <ThemedText>
                  {`You haven't planned anything for ${dayLabel}. Use the buttons below to add a task or a daily routine.`}
                </ThemedText>
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
