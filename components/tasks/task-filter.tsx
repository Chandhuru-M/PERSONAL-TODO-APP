import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';

type FilterStatus = 'today' | 'upcoming' | 'completed';

interface TaskFilterProps {
  value: FilterStatus;
  onChange: (status: FilterStatus) => void;
}

const OPTIONS: FilterStatus[] = ['today', 'upcoming', 'completed'];

export function TaskFilter({ value, onChange }: TaskFilterProps) {
  const borderColor = useThemeColor({}, 'border');
  const activeColor = useThemeColor({}, 'tint');
  const labelColor = useThemeColor({}, 'muted');
  const onTint = useThemeColor({}, 'onTint');

  return (
    <View style={styles.container}>
      {OPTIONS.map((option) => {
        const isActive = option === value;
        return (
          <Pressable
            key={option}
            style={[
              styles.chip,
              { borderColor },
              isActive && { backgroundColor: activeColor, borderColor: activeColor },
            ]}
            onPress={() => onChange(option)}
          >
            <ThemedText
              style={[styles.label, { color: labelColor }, isActive && { color: onTint }]}
            >
              {option === 'today' ? 'Today' : option === 'upcoming' ? 'Upcoming' : 'Completed'}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  chip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
  },
  label: {
    textTransform: 'capitalize',
  },
});
