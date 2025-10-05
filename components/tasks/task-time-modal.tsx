import { MaterialIcons } from '@expo/vector-icons';
import type { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { formatTime } from '@/utils/dates';

interface TaskTimeModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (range: { start: Date; end: Date }) => Promise<void>;
  taskTitle: string;
  anchorDate: Date;
  initialStart: Date;
  initialEnd: Date;
  submitting: boolean;
}

interface InlinePickerState {
  value: Date;
  onChange: (date: Date) => void;
}

export function TaskTimeModal({
  visible,
  onClose,
  onSubmit,
  taskTitle,
  anchorDate,
  initialStart,
  initialEnd,
  submitting,
}: TaskTimeModalProps) {
  const surface = useThemeColor({}, 'surface');
  const background = useThemeColor({}, 'background');
  const surfaceMuted = useThemeColor({}, 'surfaceSecondary');
  const borderColor = useThemeColor({}, 'border');
  const tint = useThemeColor({}, 'tint');
  const onTint = useThemeColor({}, 'onTint');
  const textColor = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');

  const [startTime, setStartTime] = useState<Date>(initialStart);
  const [endTime, setEndTime] = useState<Date>(initialEnd);
  const [inlinePicker, setInlinePicker] = useState<InlinePickerState | null>(null);

  useEffect(() => {
    setStartTime(initialStart);
    setEndTime((prev) => {
      if (initialEnd <= initialStart) {
        const next = new Date(initialStart);
        next.setMinutes(next.getMinutes() + 30);
        return next;
      }
      return initialEnd;
    });
  }, [initialStart, initialEnd, anchorDate]);

  const ensureEndAfterStart = useMemo(
    () =>
      (start: Date, candidate: Date) => {
        if (candidate <= start) {
          const next = new Date(start);
          next.setMinutes(next.getMinutes() + 30);
          return next;
        }
        return candidate;
      },
    [],
  );

  const commitInlinePicker = (event: DateTimePickerEvent, date?: Date) => {
    if (inlinePicker && date) {
      inlinePicker.onChange(date);
    }

    if (Platform.OS !== 'ios' || event.type === 'set') {
      setInlinePicker(null);
    }
  };

  const showTimePicker = (current: Date, onChange: (next: Date) => void) => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: current,
        mode: 'time',
        display: 'clock',
        onChange: (_event: DateTimePickerEvent, date?: Date) => {
          if (!date) return;
          const next = new Date(anchorDate);
          next.setHours(date.getHours(), date.getMinutes(), 0, 0);
          onChange(next);
        },
      });
      return;
    }

    const base = new Date(current);
    setInlinePicker({
      value: base,
      onChange: (date) => {
        const next = new Date(anchorDate);
        next.setHours(date.getHours(), date.getMinutes(), 0, 0);
        onChange(next);
      },
    });
  };

  const pickerButtonStyle = [
    styles.pickerButton,
    { borderColor, backgroundColor: surfaceMuted },
  ];

  const handleSave = async () => {
    await onSubmit({
      start: startTime,
      end: ensureEndAfterStart(startTime, endTime),
    });
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="formSheet"
    >
      <ThemedView style={[styles.container, { backgroundColor: background }]}>
        <ThemedView style={[styles.content, { backgroundColor: surface }]}> 
          <ThemedText type="title">Edit timing</ThemedText>
          <ThemedText style={{ color: muted }}>{taskTitle}</ThemedText>
          <View style={styles.field}>
            <ThemedText type="subtitle">Start time</ThemedText>
            <Pressable
              style={pickerButtonStyle}
              onPress={() => showTimePicker(startTime, (date) => {
                setStartTime(date);
                setEndTime((prev) => ensureEndAfterStart(date, prev));
              })}
              accessibilityRole="button"
            >
              <MaterialIcons name="schedule" size={18} color={tint} />
              <ThemedText style={{ color: textColor }}>{formatTime(startTime) ?? 'Select time'}</ThemedText>
            </Pressable>
          </View>
          <View style={styles.field}>
            <ThemedText type="subtitle">End time</ThemedText>
            <Pressable
              style={pickerButtonStyle}
              onPress={() => showTimePicker(endTime, (date) => {
                setEndTime(ensureEndAfterStart(startTime, date));
              })}
              accessibilityRole="button"
            >
              <MaterialIcons name="schedule" size={18} color={tint} />
              <ThemedText style={{ color: textColor }}>{formatTime(endTime) ?? 'Select time'}</ThemedText>
            </Pressable>
          </View>
        </ThemedView>
        <View style={[styles.footer, { borderColor, backgroundColor: surface }]}> 
          <Pressable style={[styles.button, styles.secondaryButton, { borderColor }]} onPress={onClose}>
            <ThemedText>Cancel</ThemedText>
          </Pressable>
          <Pressable
            style={[styles.button, { backgroundColor: tint }, submitting && styles.disabledButton]}
            onPress={handleSave}
            disabled={submitting}
          >
            <ThemedText style={[styles.primaryLabel, { color: onTint }]}>
              {submitting ? 'Saving...' : 'Save times'}
            </ThemedText>
          </Pressable>
        </View>
        {inlinePicker ? (
          <DateTimePicker
            value={inlinePicker.value}
            mode="time"
            display="spinner"
            onChange={commitInlinePicker}
          />
        ) : null}
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
  },
  content: {
    margin: 24,
    padding: 24,
    borderRadius: 16,
    gap: 16,
  },
  field: {
    gap: 8,
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
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
  disabledButton: {
    opacity: 0.6,
  },
  primaryLabel: {
    fontWeight: '600',
  },
});
