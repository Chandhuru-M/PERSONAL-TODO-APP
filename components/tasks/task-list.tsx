import { FlatList, RefreshControl, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import type { Task } from '@/types/task';
import { TaskItem } from './task-item';

interface TaskListProps {
  tasks: Task[];
  loading: boolean;
  error?: string | null;
  onRefresh: () => void;
  onToggleComplete: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
}

export function TaskList({ tasks, loading, error, onRefresh, onToggleComplete, onEdit, onDelete }: TaskListProps) {
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
                <ThemedText type="subtitle">No tasks yet</ThemedText>
                <ThemedText>Tap the + button to add your first task.</ThemedText>
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
