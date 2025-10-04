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

export default function SignUpScreen() {
  const router = useRouter();
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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

    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
  await signUp(email.trim(), password);
  setMessage('Account created! Redirecting to your tasks…');
  router.replace('/' as never);
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
