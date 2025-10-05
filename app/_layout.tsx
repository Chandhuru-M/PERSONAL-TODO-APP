import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { Colors } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const navigationTheme = {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      primary: Colors.dark.tint,
      background: Colors.dark.background,
      card: Colors.dark.surface,
      text: Colors.dark.text,
      border: Colors.dark.border,
      notification: Colors.dark.tint,
    },
  } as const;

  return (
    <AuthProvider>
      <ThemeProvider value={navigationTheme}>
        <RootNavigator />
        <StatusBar style="light" />
      </ThemeProvider>
    </AuthProvider>
  );
}

function RootNavigator() {
  const { loading, session } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = (segments[0] as string | undefined) === '(auth)';

    if (!session && !inAuthGroup) {
      router.replace('/sign-in' as never);
    } else if (session && inAuthGroup) {
      router.replace('/' as never);
    }
  }, [loading, session, segments, router]);

  if (loading) {
    return null;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="routines"
        options={{
          headerShown: true,
          title: 'Daily routines',
        }}
      />
      <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
    </Stack>
  );
}
