import type { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { Task } from '@/types/task';
import { formatDateTime, formatTime } from '@/utils/dates';

export interface TaskFormValues {
  title: string;
  description: string | null;
  due_at: string | null;
  reminder_at: string | null;
}

interface TaskFormModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (values: TaskFormValues, existingTask?: Task) => Promise<void>;
  submitting: boolean;
  task?: Task | null;
}

export function TaskFormModal({ visible, onClose, onSubmit, submitting, task }: TaskFormModalProps) {
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [dueDate, setDueDate] = useState<Date | null>(task?.due_at ? new Date(task.due_at) : null);
  const [reminderEnabled, setReminderEnabled] = useState(Boolean(task?.reminder_at));
  const [reminderDate, setReminderDate] = useState<Date | null>(
    task?.reminder_at ? new Date(task.reminder_at) : null,
  );
  const background = useThemeColor({}, 'background');
  const surface = useThemeColor({}, 'surface');
  const surfaceMuted = useThemeColor({}, 'surfaceSecondary');
  const borderColor = useThemeColor({}, 'border');
  const textColor = useThemeColor({}, 'text');
  const mutedColor = useThemeColor({}, 'muted');
  const tint = useThemeColor({}, 'tint');
  const onTint = useThemeColor({}, 'onTint');

  const isEditing = Boolean(task);

  useEffect(() => {
    setTitle(task?.title ?? '');
    setDescription(task?.description ?? '');
    setDueDate(task?.due_at ? new Date(task.due_at) : null);
    setReminderEnabled(Boolean(task?.reminder_at));
    setReminderDate(task?.reminder_at ? new Date(task.reminder_at) : null);
  }, [task, visible]);

  const closeAndReset = () => {
    onClose();
  };

  const showPicker = (mode: 'date' | 'time', currentDate: Date | null, onChange: (date: Date) => void) => {
    if (Platform.OS === 'android') {
      const baseDate = currentDate ?? new Date();
      DateTimePickerAndroid.open({
        value: baseDate,
        mode,
        onChange: (_event: DateTimePickerEvent, date?: Date) => {
          if (date) onChange(date);
        },
        minimumDate: new Date(),
      });
      return;
    }

    setInlinePicker({ mode, onChange, value: currentDate ?? new Date() });
  };

  const [inlinePicker, setInlinePicker] = useState<
    | {
        mode: 'date' | 'time';
        value: Date;
        onChange: (date: Date) => void;
      }
    | null
  >(null);

  const commitInlinePicker = (event: DateTimePickerEvent, date?: Date) => {
    if (inlinePicker && date) {
      inlinePicker.onChange(date);
    }
    if (Platform.OS !== 'ios' || event.type === 'set') {
      setInlinePicker(null);
    }
  };

  const buildPayload = (): TaskFormValues => ({
    title: title.trim(),
    description: description.trim() ? description.trim() : null,
    due_at: dueDate ? dueDate.toISOString() : null,
    reminder_at: reminderEnabled && reminderDate ? reminderDate.toISOString() : null,
  });

  const handleSubmit = async () => {
    const payload = buildPayload();
    await onSubmit(payload, task ?? undefined);
    if (!task) {
      setTitle('');
      setDescription('');
      setDueDate(null);
      setReminderEnabled(false);
      setReminderDate(null);
    }
    onClose();
  };

  const handleReminderToggle = (value: boolean) => {
    setReminderEnabled(value);
    if (value && !reminderDate) {
      const next = dueDate ?? new Date();
      next.setMinutes(next.getMinutes() + 15);
      setReminderDate(next);
    }
    if (!value) {
      setReminderDate(null);
    }
  };

  const pickerButtonStyle = [styles.pickerButton, { borderColor, backgroundColor: surfaceMuted }];
  const inputStyle = [styles.input, { borderColor, color: textColor, backgroundColor: surfaceMuted }];
  const multilineInputStyle = [
    styles.input,
    styles.multiline,
    { borderColor, color: textColor, backgroundColor: surfaceMuted },
  ];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={closeAndReset}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.flex, { backgroundColor: background }]}
      >
        <ScrollView contentContainerStyle={[styles.content, { backgroundColor: surface }]}>
          <ThemedText type="title">{isEditing ? 'Edit task' : 'Create task'}</ThemedText>
          <View style={styles.field}>
            <ThemedText type="subtitle">Title</ThemedText>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Task title"
              style={inputStyle}
              placeholderTextColor={mutedColor}
            />
          </View>
          <View style={styles.field}>
            <ThemedText type="subtitle">Description</ThemedText>
            <TextInput
              value={description ?? ''}
              onChangeText={setDescription}
              placeholder="Add a few details (optional)"
              style={multilineInputStyle}
              multiline
              placeholderTextColor={mutedColor}
            />
          </View>
          <View style={styles.field}>
            <ThemedText type="subtitle">Due date</ThemedText>
            <View style={styles.row}>
              <Pressable style={pickerButtonStyle} onPress={() => showPicker('date', dueDate, setDueDate)}>
                <ThemedText>{dueDate ? formatDateTime(dueDate) : 'Select date'}</ThemedText>
              </Pressable>
              <Pressable
                style={pickerButtonStyle}
                onPress={() => showPicker('time', dueDate ?? new Date(), (date) => {
                  setDueDate((prev) => {
                    const base = prev ?? new Date();
                    base.setHours(date.getHours(), date.getMinutes(), 0, 0);
                    return new Date(base);
                  });
                })}
                disabled={!dueDate}
              >
                <ThemedText>{dueDate ? formatTime(dueDate) ?? 'Select time' : 'Select time'}</ThemedText>
              </Pressable>
            </View>
          </View>
          <View style={styles.field}>
            <View style={styles.rowBetween}>
              <ThemedText type="subtitle">Reminder</ThemedText>
              <Switch
                value={reminderEnabled}
                onValueChange={handleReminderToggle}
                trackColor={{ false: borderColor, true: tint }}
                thumbColor={Platform.OS === 'android' ? (reminderEnabled ? onTint : mutedColor) : undefined}
              />
            </View>
            {reminderEnabled ? (
              <View style={styles.row}>
                <Pressable style={pickerButtonStyle} onPress={() => showPicker('date', reminderDate, setReminderDate)}>
                  <ThemedText>{reminderDate ? formatDateTime(reminderDate) : 'Select date'}</ThemedText>
                </Pressable>
                <Pressable
                  style={pickerButtonStyle}
                  onPress={() =>
                    showPicker('time', reminderDate ?? new Date(), (date) => {
                      setReminderDate((prev) => {
                        const base = prev ?? new Date();
                        base.setHours(date.getHours(), date.getMinutes(), 0, 0);
                        return new Date(base);
                      });
                    })
                  }
                  disabled={!reminderDate}
                >
                  <ThemedText>{reminderDate ? formatTime(reminderDate) ?? 'Select time' : 'Select time'}</ThemedText>
                </Pressable>
              </View>
            ) : null}
          </View>
        </ScrollView>
        <View style={[styles.footer, { borderColor, backgroundColor: surface }]}> 
          <Pressable
            style={[styles.button, styles.secondaryButton, { borderColor }]}
            onPress={closeAndReset}
          >
            <ThemedText>Cancel</ThemedText>
          </Pressable>
          <Pressable
            style={[styles.button, { backgroundColor: tint }, submitting && styles.disabledButton]}
            onPress={handleSubmit}
            disabled={submitting || !title.trim()}
          >
            <ThemedText style={[styles.primaryLabel, { color: onTint }]}>
              {submitting ? 'Saving...' : isEditing ? 'Update' : 'Create'}
            </ThemedText>
          </Pressable>
        </View>
        {inlinePicker ? (
          <DateTimePicker
            value={inlinePicker.value}
            mode={inlinePicker.mode}
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onChange={commitInlinePicker}
            minimumDate={new Date()}
          />
        ) : null}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    padding: 24,
    gap: 20,
  },
  field: {
    gap: 8,
  },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  multiline: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pickerButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    padding: 24,
    borderTopWidth: 1,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
  },
  primaryLabel: {
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.5,
  },
});
