import { MaterialIcons } from '@expo/vector-icons';
import type { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useCallback, useEffect, useMemo, useState } from 'react';
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

import { TaskTimeModal } from '@/components/tasks/task-time-modal';
import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { Task } from '@/types/task';
import { formatDate, formatDateTime, formatTime, startOfDay } from '@/utils/dates';
import {
    datesToTimeRange,
    injectTimeMetadata,
    minutesToDate,
    parseTimeRange,
    stripTimeMetadata,
} from '@/utils/time-range';

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
  selectedDate: Date;
  mode: 'task' | 'routine';
}

export function TaskFormModal({
  visible,
  onClose,
  onSubmit,
  submitting,
  task,
  selectedDate,
  mode,
}: TaskFormModalProps) {
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(() => stripTimeMetadata(task?.description ?? ''));
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

  const defaultTaskStart = useCallback(() => {
    const base = new Date(selectedDate);
    base.setHours(9, 0, 0, 0);
    return base;
  }, [selectedDate]);

  const defaultTaskEnd = useCallback(
    (base?: Date) => {
      const reference = base ? new Date(base) : defaultTaskStart();
      reference.setMinutes(reference.getMinutes() + 60);
      return reference;
    },
    [defaultTaskStart],
  );

  const ensureEndAfterStart = useCallback((start: Date, candidate: Date) => {
    if (candidate <= start) {
      const next = new Date(start);
      next.setMinutes(next.getMinutes() + 30);
      return next;
    }
    return candidate;
  }, []);

  const [startTime, setStartTime] = useState<Date>(() => defaultTaskStart());
  const [endTime, setEndTime] = useState<Date>(() => defaultTaskEnd());
  const [isTimeModalVisible, setTimeModalVisible] = useState(false);

  const isEditing = Boolean(task);
  const titleLabel = isEditing
    ? mode === 'routine'
      ? 'Edit routine'
      : 'Edit task'
    : mode === 'routine'
    ? 'Create routine'
    : 'Create task';

  const closeAndReset = () => {
    setTimeModalVisible(false);
    onClose();
  };

  const defaultReminderDate = useCallback(() => {
    const base = new Date(selectedDate);
    const now = new Date();
    base.setHours(now.getHours(), now.getMinutes(), 0, 0);
    base.setMinutes(base.getMinutes() + 15);
    return base;
  }, [selectedDate]);

  useEffect(() => {
    setTitle(task?.title ?? '');
    const rawDescription = task?.description ?? '';
    const sanitized = stripTimeMetadata(rawDescription);
    setDescription(sanitized);

    const parsedRange = parseTimeRange(rawDescription);
    if (parsedRange) {
      const start = minutesToDate(parsedRange.startMinutes, selectedDate);
      const end = minutesToDate(parsedRange.endMinutes, selectedDate);
      setStartTime(start);
      setEndTime(ensureEndAfterStart(start, end));
    } else {
      const start = defaultTaskStart();
      setStartTime(start);
      setEndTime(defaultTaskEnd(start));
    }

    if (task?.reminder_at) {
      setReminderEnabled(true);
      setReminderDate(new Date(task.reminder_at));
      return;
    }

    if (!task && mode === 'routine') {
      setReminderEnabled(true);
      setReminderDate(defaultReminderDate());
      return;
    }

    setReminderEnabled(false);
    setReminderDate(null);
  }, [
    task,
    visible,
    mode,
    selectedDate,
    defaultTaskStart,
    defaultTaskEnd,
    ensureEndAfterStart,
    defaultReminderDate,
  ]);

  const showPicker = (
    pickerMode: 'date' | 'time',
    currentDate: Date | null,
    onChange: (date: Date) => void,
  ) => {
    const baseDate = currentDate ?? (pickerMode === 'date' ? selectedDate : defaultReminderDate());

    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: baseDate,
        mode: pickerMode,
        onChange: (_event: DateTimePickerEvent, date?: Date) => {
          if (date) onChange(date);
        },
        minimumDate: selectedDate,
      });
      return;
    }

    setInlinePicker({ mode: pickerMode, onChange, value: baseDate });
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

  const openTimeModal = () => {
    setTimeModalVisible(true);
  };

  const handleTimeModalSubmit = async ({ start, end }: { start: Date; end: Date }) => {
    if (reminderEnabled && reminderDate) {
      const previousStartMinute = Math.floor(startTime.getTime() / 60000);
      const reminderMinute = Math.floor(reminderDate.getTime() / 60000);
      if (previousStartMinute === reminderMinute) {
        setReminderDate(new Date(start));
      }
    }
    setStartTime(start);
    setEndTime(ensureEndAfterStart(start, end));
    setTimeModalVisible(false);
  };

  const taskTimeModalAnchor = useMemo(() => startOfDay(selectedDate), [selectedDate]);

  const buildPayload = (): TaskFormValues => {
    const trimmedDescription = description.trim();
    const preparedDescription = injectTimeMetadata(
      trimmedDescription.length ? trimmedDescription : null,
      datesToTimeRange(startTime, endTime),
    );

    return {
      title: title.trim(),
      description: preparedDescription,
      due_at: mode === 'routine' ? null : startOfDay(selectedDate).toISOString(),
      reminder_at: reminderEnabled && reminderDate ? reminderDate.toISOString() : null,
    };
  };

  const handleSubmit = async () => {
    const payload = buildPayload();
    await onSubmit(payload, task ?? undefined);
    if (!task) {
      setTitle('');
      setDescription('');
      setReminderEnabled(false);
      setReminderDate(null);
      const start = defaultTaskStart();
      setStartTime(start);
      setEndTime(defaultTaskEnd(start));
    }
    onClose();
  };

  const handleReminderToggle = (value: boolean) => {
    setReminderEnabled(value);
    if (value && !reminderDate) {
      setReminderDate(defaultReminderDate());
    }
    if (!value) {
      setReminderDate(null);
    }
  };

  const updateStartTime = (date: Date) => {
    const next = new Date(selectedDate);
    next.setHours(date.getHours(), date.getMinutes(), 0, 0);
    if (reminderEnabled && reminderDate) {
      const previousStartMinute = Math.floor(startTime.getTime() / 60000);
      const reminderMinute = Math.floor(reminderDate.getTime() / 60000);
      if (previousStartMinute === reminderMinute) {
        const alignedReminder = new Date(next);
        setReminderDate(alignedReminder);
      }
    }
    setStartTime(next);
    setEndTime((prev) => ensureEndAfterStart(next, prev));
  };

  const updateEndTime = (date: Date) => {
    const next = new Date(selectedDate);
    next.setHours(date.getHours(), date.getMinutes(), 0, 0);
    setEndTime(ensureEndAfterStart(startTime, next));
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
          <ThemedText type="title">{titleLabel}</ThemedText>
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
            <ThemedText type="subtitle">Scheduled day</ThemedText>
            <ThemedText style={{ color: mutedColor }}>
              {mode === 'routine'
                ? 'Repeats every day'
                : formatDate(selectedDate, { weekday: 'long' }) ?? 'Select a day'}
            </ThemedText>
          </View>
          {mode === 'task' || mode === 'routine' ? (
            <View style={styles.field}>
              <ThemedText type="subtitle">
                {mode === 'routine' ? 'Routine time' : 'Time'}
              </ThemedText>
              <View style={styles.row}>
                <Pressable
                  style={pickerButtonStyle}
                  onPress={() => showPicker('time', startTime, updateStartTime)}
                >
                  <ThemedText>{formatTime(startTime) ?? 'Start time'}</ThemedText>
                </Pressable>
                <Pressable
                  style={pickerButtonStyle}
                  onPress={() => showPicker('time', endTime, updateEndTime)}
                >
                  <ThemedText>{formatTime(endTime) ?? 'End time'}</ThemedText>
                </Pressable>
                <Pressable
                  style={[styles.timeIconButton, { borderColor, backgroundColor: surfaceMuted }]}
                  onPress={openTimeModal}
                  accessibilityRole="button"
                >
                  <MaterialIcons name="schedule" size={22} color={tint} />
                </Pressable>
              </View>
            </View>
          ) : null}
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
                <Pressable
                  style={pickerButtonStyle}
                  onPress={() => showPicker('date', reminderDate, setReminderDate)}
                >
                  <ThemedText>{reminderDate ? formatDateTime(reminderDate) : 'Select date'}</ThemedText>
                </Pressable>
                <Pressable
                  style={pickerButtonStyle}
                  onPress={() =>
                    showPicker('time', reminderDate, (date) => {
                      setReminderDate((prev) => {
                        const base = prev ?? defaultReminderDate();
                        base.setHours(date.getHours(), date.getMinutes(), 0, 0);
                        return new Date(base);
                      });
                    })
                  }
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
              {submitting ? 'Saving...' : isEditing ? 'Update' : mode === 'routine' ? 'Create routine' : 'Create'}
            </ThemedText>
          </Pressable>
        </View>
        {inlinePicker ? (
          <DateTimePicker
            value={inlinePicker.value}
            mode={inlinePicker.mode}
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onChange={commitInlinePicker}
            minimumDate={selectedDate}
          />
        ) : null}
        {mode === 'task' || mode === 'routine' ? (
          <TaskTimeModal
            visible={isTimeModalVisible}
            onClose={() => setTimeModalVisible(false)}
            onSubmit={handleTimeModalSubmit}
            taskTitle={title || 'Task timing'}
            anchorDate={taskTimeModalAnchor}
            initialStart={startTime}
            initialEnd={endTime}
            submitting={false}
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
  timeIconButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
