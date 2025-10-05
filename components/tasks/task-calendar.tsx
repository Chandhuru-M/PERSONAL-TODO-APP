import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { startOfDay } from '@/utils/dates';

interface TaskCalendarProps {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
}

const DAYS_IN_WEEK = 7;

const addDays = (date: Date, amount: number): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
};

const startOfWeek = (date: Date): Date => {
  const next = startOfDay(date);
  const weekday = next.getDay();
  const diff = (weekday + 6) % 7; // Monday as first day
  next.setDate(next.getDate() - diff);
  return next;
};

const isSameDay = (a: Date, b: Date): boolean => startOfDay(a).getTime() === startOfDay(b).getTime();

export function TaskCalendar({ selectedDate, onSelectDate }: TaskCalendarProps) {
  const [anchorDate, setAnchorDate] = useState<Date>(startOfWeek(selectedDate));
  const [inlinePicker, setInlinePicker] = useState<Date | null>(null);

  const surface = useThemeColor({}, 'surfaceSecondary');
  const border = useThemeColor({}, 'border');
  const text = useThemeColor({}, 'text');
  const tint = useThemeColor({}, 'tint');
  const onTint = useThemeColor({}, 'onTint');
  const muted = useThemeColor({}, 'muted');

  useEffect(() => {
    const start = startOfWeek(selectedDate);
    const end = addDays(start, DAYS_IN_WEEK - 1);
    if (selectedDate < start || selectedDate > end) {
      setAnchorDate(start);
    }
  }, [selectedDate]);

  const days = useMemo(() => Array.from({ length: DAYS_IN_WEEK }, (_, index) => addDays(anchorDate, index)), [anchorDate]);

  const today = startOfDay(new Date());
  const yesterday = addDays(today, -1);

  const monthLabel = useMemo(() => {
    return new Intl.DateTimeFormat(undefined, {
      month: 'long',
      year: 'numeric',
    }).format(selectedDate);
  }, [selectedDate]);

  const shiftWeek = useCallback((offset: number) => {
    setAnchorDate((prev) => addDays(prev, offset * DAYS_IN_WEEK));
  }, []);

  const handlePickDate = useCallback(() => {
    const handleChange = (_event: any, nextDate?: Date) => {
      if (nextDate) {
        onSelectDate(startOfDay(nextDate));
        setInlinePicker(null);
      }
    };

    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: selectedDate,
        mode: 'date',
        onChange: handleChange,
        minimumDate: new Date(2000, 0, 1),
      });
      return;
    }

    setInlinePicker(selectedDate);
  }, [onSelectDate, selectedDate]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={() => shiftWeek(-1)} style={styles.chevron}>
          <ThemedText style={{ color: text }}>{'‹'}</ThemedText>
        </Pressable>
        <ThemedText type="subtitle" style={{ color: text }}>
          {monthLabel}
        </ThemedText>
        <Pressable accessibilityRole="button" onPress={() => shiftWeek(1)} style={styles.chevron}>
          <ThemedText style={{ color: text }}>{'›'}</ThemedText>
        </Pressable>
      </View>
      <View style={styles.weekRow}>
        {days.map((day) => {
          const active = isSameDay(day, selectedDate);
          const isHistorical = day < yesterday;
          const weekdayColor = active ? onTint : muted;
          const dayNumberColor = isHistorical && !active ? muted : active ? onTint : text;
          const cardStyle = [
            styles.dayCard,
            isHistorical && !active && styles.historicDay,
            { borderColor: border, backgroundColor: active ? tint : surface },
          ];
          return (
            <Pressable
              key={day.toISOString()}
              style={cardStyle}
              onPress={() => onSelectDate(startOfDay(day))}
            >
              <ThemedText style={[styles.weekday, { color: weekdayColor }]}>
                {new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(day)}
              </ThemedText>
              <ThemedText style={[styles.dayNumber, { color: dayNumberColor }]}>
                {day.getDate()}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
      <Pressable accessibilityRole="button" onPress={handlePickDate} style={[styles.pickButton, { borderColor: border }]}
      >
        <ThemedText style={{ color: text }}>Pick a date</ThemedText>
      </Pressable>
      {inlinePicker ? (
        <DateTimePicker
          value={inlinePicker}
          mode="date"
          display="inline"
          onChange={(_event, date) => {
            if (date) {
              onSelectDate(startOfDay(date));
              setInlinePicker(null);
            }
          }}
          minimumDate={new Date(2000, 0, 1)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chevron: {
    padding: 4,
  },
  weekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  dayCard: {
    flex: 1,
    minWidth: 0,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 8,
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 2,
  },
  historicDay: {
    opacity: 0.55,
  },
  weekday: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dayNumber: {
    fontSize: 16,
    fontWeight: '600',
  },
  pickButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
});
