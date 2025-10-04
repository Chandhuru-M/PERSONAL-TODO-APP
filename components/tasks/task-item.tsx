import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { Task } from '@/types/task';
import { formatDateTime, isPastDate } from '@/utils/dates';

interface TaskItemProps {
  task: Task;
  onToggleComplete: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
}

export function TaskItem({ task, onToggleComplete, onEdit, onDelete }: TaskItemProps) {
  const tint = useThemeColor({}, 'tint');
  const textColor = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const surface = useThemeColor({}, 'surfaceSecondary');
  const borderColor = useThemeColor({}, 'border');
  const danger = useThemeColor({}, 'danger');
  const dueLabel = formatDateTime(task.due_at);
  const reminderLabel = formatDateTime(task.reminder_at);
  const isOverdue = isPastDate(task.due_at) && !task.is_completed;

  return (
    <ThemedView
      lightColor={surface}
      darkColor={surface}
      style={[
        styles.container,
        { borderColor },
        task.is_completed && styles.completedContainer,
      ]}
    >
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          onPress={() => onToggleComplete(task)}
          style={styles.checkbox}
        >
          <MaterialIcons
            name={task.is_completed ? 'check-circle' : 'radio-button-unchecked'}
            size={24}
            color={task.is_completed ? tint : textColor}
          />
        </Pressable>
        <Pressable style={styles.content} onPress={() => onEdit(task)}>
          <ThemedText
            type="subtitle"
            style={task.is_completed ? styles.completedText : undefined}
          >
            {task.title}
          </ThemedText>
          {task.description ? (
            <ThemedText
              numberOfLines={2}
              style={task.is_completed ? styles.completedText : undefined}
            >
              {task.description}
            </ThemedText>
          ) : null}
          <View style={styles.metaRow}>
            {dueLabel ? (
              <ThemedText
                style={[styles.metaText, { color: muted }, isOverdue && { color: danger }]}
              >
                Due {dueLabel}
              </ThemedText>
            ) : null}
            {reminderLabel ? (
              <ThemedText style={[styles.metaText, { color: muted }]}>Reminder {reminderLabel}</ThemedText>
            ) : null}
          </View>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => onDelete(task)} style={styles.iconButton}>
          <MaterialIcons name="delete-outline" size={20} color={danger} />
        </Pressable>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
  },
  completedContainer: {
    opacity: 0.6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  checkbox: {
    paddingTop: 2,
  },
  content: {
    flex: 1,
    gap: 4,
  },
  completedText: {
    textDecorationLine: 'line-through',
  },
  metaRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  metaText: {
    fontSize: 12,
  },
  iconButton: {
    padding: 4,
    alignSelf: 'flex-start',
  },
});
