import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import {
    KeyboardAvoidingView,
    Platform,
    Pressable,
    StyleSheet,
    TextInput,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/contexts/AuthContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import { supabase } from '@/lib/supabase';
import { DEFAULT_MEAL_PREFERENCES, saveMealPreferences } from '@/storage/meal-preferences';

const MINUTES_PER_DAY = 24 * 60;
const TIME_REGEX = /^(\d{1,2}):(\d{2})$/;

const formatMinutesToTime = (minutes: number): string => {
  const normalized = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours = Math.floor(normalized / 60);
  const mins = normalized % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
};

const parseTimeInput = (value: string): number | null => {
  const trimmed = value.trim();
  const match = TIME_REGEX.exec(trimmed);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23) return null;
  if (minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
};

export default function SignUpScreen() {
  const router = useRouter();
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [breakfastTime, setBreakfastTime] = useState(
    formatMinutesToTime(DEFAULT_MEAL_PREFERENCES.breakfastStart),
  );
  const [lunchTime, setLunchTime] = useState(formatMinutesToTime(DEFAULT_MEAL_PREFERENCES.lunchStart));
  const [dinnerTime, setDinnerTime] = useState(
    formatMinutesToTime(DEFAULT_MEAL_PREFERENCES.dinnerStart),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const background = useThemeColor({}, 'background');
  const surface = useThemeColor({}, 'surface');
  const surfaceMuted = useThemeColor({}, 'surfaceSecondary');
  const borderColor = useThemeColor({}, 'border');
  const textColor = useThemeColor({}, 'text');
  const mutedColor = useThemeColor({}, 'muted');
  const tint = useThemeColor({}, 'tint');
  const onTint = useThemeColor({}, 'onTint');
  const danger = useThemeColor({}, 'danger');
  const success = useThemeColor({}, 'success');

  const handleSubmit = async () => {
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    const breakfastMinutes = parseTimeInput(breakfastTime);
    const lunchMinutes = parseTimeInput(lunchTime);
    const dinnerMinutes = parseTimeInput(dinnerTime);

    if (
      breakfastMinutes === null ||
      lunchMinutes === null ||
      dinnerMinutes === null
    ) {
      setError('Please enter meal times in HH:MM (24-hour) format.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const authUser = await signUp(email.trim(), password);

      let resolvedUserId: string | null = authUser?.id ?? null;
      if (!resolvedUserId) {
        try {
          const { data } = await supabase.auth.getUser();
          resolvedUserId = data.user?.id ?? null;
        } catch (lookupError) {
          console.warn('Unable to resolve user after sign up', lookupError);
        }
      }

      if (resolvedUserId) {
        try {
          await saveMealPreferences(resolvedUserId, {
            breakfastStart: breakfastMinutes,
            lunchStart: lunchMinutes,
            dinnerStart: dinnerMinutes,
          });
        } catch (prefError) {
          console.warn('Failed to save meal preferences', prefError);
        }
        setMessage('Account created! Personalizing your routine…');
        router.replace('/' as never);
      } else {
        setMessage('Account created! Check your email to confirm your account.');
      }
    } catch (err) {
      const messageText = err instanceof Error ? err.message : 'Unable to sign up';
      setError(messageText);
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle = [styles.input, { borderColor, color: textColor, backgroundColor: surfaceMuted }];

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: background }]}> 
      <KeyboardAvoidingView
        style={[styles.flex, { backgroundColor: background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={80}
      >
        <ThemedView lightColor={surface} darkColor={surface} style={styles.container}>
          <ThemedText type="title">Create an account</ThemedText>
          <ThemedText style={[styles.subtitle, { color: mutedColor }]}>Invite friends and share your plan.</ThemedText>

          <View style={styles.field}>
            <ThemedText>Email</ThemedText>
            <TextInput
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              style={inputStyle}
              placeholder="you@example.com"
              placeholderTextColor={mutedColor}
            />
          </View>

          <View style={styles.field}>
            <ThemedText>Password</ThemedText>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              style={inputStyle}
              placeholder="••••••••"
              placeholderTextColor={mutedColor}
            />
          </View>

          <View style={styles.field}>
            <ThemedText>Confirm password</ThemedText>
            <TextInput
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              style={inputStyle}
              placeholder="••••••••"
              placeholderTextColor={mutedColor}
            />
          </View>

          <View style={styles.sectionHeader}>
            <ThemedText style={styles.sectionTitle}>Daily meal times</ThemedText>
            <ThemedText style={[styles.helperText, { color: mutedColor }]}>
              We personalize your routine using these times. Use 24-hour format, e.g. 07:30.
            </ThemedText>
          </View>

          <View style={styles.field}>
            <ThemedText>Breakfast</ThemedText>
            <TextInput
              value={breakfastTime}
              onChangeText={setBreakfastTime}
              style={inputStyle}
              placeholder="08:00"
              placeholderTextColor={mutedColor}
              keyboardType="numbers-and-punctuation"
              autoCapitalize="none"
              maxLength={5}
            />
          </View>

          <View style={styles.field}>
            <ThemedText>Lunch</ThemedText>
            <TextInput
              value={lunchTime}
              onChangeText={setLunchTime}
              style={inputStyle}
              placeholder="13:00"
              placeholderTextColor={mutedColor}
              keyboardType="numbers-and-punctuation"
              autoCapitalize="none"
              maxLength={5}
            />
          </View>

          <View style={styles.field}>
            <ThemedText>Dinner</ThemedText>
            <TextInput
              value={dinnerTime}
              onChangeText={setDinnerTime}
              style={inputStyle}
              placeholder="19:30"
              placeholderTextColor={mutedColor}
              keyboardType="numbers-and-punctuation"
              autoCapitalize="none"
              maxLength={5}
            />
          </View>

          {error ? <ThemedText style={[styles.error, { color: danger }]}>{error}</ThemedText> : null}
          {message ? <ThemedText style={[styles.success, { color: success }]}>{message}</ThemedText> : null}

          <Pressable
            style={[styles.primaryButton, { backgroundColor: tint }, submitting && styles.disabledButton]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            <ThemedText style={[styles.primaryText, { color: onTint }]}>
              {submitting ? 'Creating…' : 'Create account'}
            </ThemedText>
          </Pressable>

          <View style={styles.footerRow}>
            <ThemedText>Already have an account?</ThemedText>
            <Link href={'/sign-in' as any} asChild>
              <Pressable>
                <ThemedText style={[styles.link, { color: tint }]}>Sign in</ThemedText>
              </Pressable>
            </Link>
          </View>
        </ThemedView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    padding: 24,
    gap: 20,
    justifyContent: 'center',
  },
  subtitle: {
    opacity: 0.7,
  },
  field: {
    gap: 8,
  },
  sectionHeader: {
    gap: 8,
  },
  sectionTitle: {
    fontWeight: '600',
  },
  helperText: {
    fontSize: 12,
    lineHeight: 16,
  },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  primaryButton: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryText: {
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.6,
  },
  footerRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  link: {
    fontWeight: '600',
  },
  error: {
    fontWeight: '600',
  },
  success: {
    fontWeight: '600',
  },
});
