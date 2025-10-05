import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { Task } from '@/types/task';
import { formatDate, formatDateTime, isPastDate } from '@/utils/dates';
import { parseTimeRange, stripTimeMetadata, timeRangeToFriendly } from '@/utils/time-range';

interface TaskItemProps {
  task: Task;
  onToggleComplete?: (task: Task) => void;
  onEdit?: (task: Task) => void;
  onDelete?: (task: Task) => void;
  onAdjustTime?: (task: Task) => void;
  readOnly?: boolean;
}

export function TaskItem({
  task,
  onToggleComplete,
  onEdit,
  onDelete,
  onAdjustTime,
  readOnly = false,
}: TaskItemProps) {
  const tint = useThemeColor({}, 'tint');
  const textColor = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const surface = useThemeColor({}, 'surfaceSecondary');
  const borderColor = useThemeColor({}, 'border');
  const danger = useThemeColor({}, 'danger');
  const isRoutine = !task.due_at;
  const isRest = isRoutine && task.title.toLowerCase().includes('rest');
  const dueLabel = task.due_at ? formatDate(task.due_at) : null;
  const reminderLabel = formatDateTime(task.reminder_at);
  const isOverdue = isPastDate(task.due_at) && !task.is_completed;
  const parsedTimeRange = parseTimeRange(task.description ?? null);
  const timeLabel = parsedTimeRange ? timeRangeToFriendly(parsedTimeRange) : null;
  const narrativeLines = stripTimeMetadata(task.description ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const canAdjustTime = !isRoutine && !readOnly && Boolean(onAdjustTime) && Boolean(task.due_at);

  const handleToggle = () => {
    if (readOnly || !onToggleComplete) return;
    onToggleComplete(task);
  };

  const handleEdit = () => {
    if (readOnly || !onEdit) return;
    onEdit(task);
  };

  const handleDelete = () => {
    if (readOnly || !onDelete) return;
    onDelete(task);
  };

  return (
    <ThemedView
      lightColor={surface}
      darkColor={surface}
      style={[
        styles.container,
        { borderColor },
        task.is_completed && styles.completedContainer,
        readOnly && styles.readOnlyContainer,
      ]}
    >
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          disabled={readOnly || !onToggleComplete}
          onPress={handleToggle}
          style={styles.checkbox}
        >
          <MaterialIcons
            name={task.is_completed ? 'check-circle' : 'radio-button-unchecked'}
            size={24}
            color={task.is_completed ? tint : textColor}
          />
        </Pressable>
        <Pressable style={styles.content} onPress={handleEdit} disabled={readOnly || !onEdit}>
          <ThemedText
            type="subtitle"
            style={task.is_completed ? styles.completedText : undefined}
          >
            {task.title}
          </ThemedText>
          {narrativeLines.map((line, index) => (
            <ThemedText
              key={`${task.id}-line-${index}`}
              numberOfLines={index === 0 ? 2 : 1}
              style={task.is_completed ? styles.completedText : undefined}
            >
              {line}
            </ThemedText>
          ))}
          <View style={styles.metaRow}>
            {timeLabel ? (
              isRoutine ? (
                <ThemedText style={[styles.timeText, { color: muted }]}>{timeLabel}</ThemedText>
              ) : (
                <Pressable
                  style={[styles.timePill, { borderColor: muted }]}
                  onPress={() => {
                    if (readOnly || !onAdjustTime) return;
                    onAdjustTime(task);
                  }}
                  disabled={readOnly || !onAdjustTime}
                  accessibilityRole="button"
                >
                  <MaterialIcons
                    name="schedule"
                    size={14}
                    color={readOnly || !onAdjustTime ? muted : tint}
                  />
                  <ThemedText style={[styles.timeText, { color: muted }]}>{timeLabel}</ThemedText>
                </Pressable>
              )
            ) : null}
            {isRoutine ? (
              <ThemedText style={[styles.metaText, { color: isRest ? muted : tint }]}>
                {isRest ? 'Rest block' : 'Daily routine'}
              </ThemedText>
            ) : null}
            {dueLabel ? (
              <ThemedText
                style={[styles.metaText, { color: muted }, isOverdue && { color: danger }]}
              >
                Scheduled {dueLabel}
              </ThemedText>
            ) : null}
            {reminderLabel ? (
              <ThemedText style={[styles.metaText, { color: muted }]}>Reminder {reminderLabel}</ThemedText>
            ) : null}
          </View>
        </Pressable>
        {!readOnly ? (
          <View style={styles.actionColumn}>
            {canAdjustTime ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => onAdjustTime?.(task)}
                style={styles.iconButton}
              >
                <MaterialIcons name="schedule" size={20} color={tint} />
              </Pressable>
            ) : null}
            {onDelete ? (
              <Pressable
                accessibilityRole="button"
                onPress={handleDelete}
                style={styles.iconButton}
              >
                <MaterialIcons name="delete-outline" size={20} color={danger} />
              </Pressable>
            ) : null}
          </View>
        ) : null}
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
  readOnlyContainer: {
    opacity: 0.85,
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
  timeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  timePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  iconButton: {
    padding: 4,
    alignSelf: 'flex-start',
  },
  actionColumn: {
    alignItems: 'center',
    gap: 4,
  },
});
