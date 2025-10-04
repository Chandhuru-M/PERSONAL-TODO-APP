import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { fetchCurrentUser } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import type { UserProfile } from '@/types/user';

interface AuthContextValue {
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    supabase.auth
      .getSession()
      .then((result: Awaited<ReturnType<typeof supabase.auth.getSession>>) => {
        const { data } = result;
        if (!isMounted) return;
        setSession(data.session ?? null);
        setUser(data.session?.user ?? null);
        setLoading(false);
      })
      .catch((error: unknown) => {
        console.warn('Failed to retrieve session', error);
        if (isMounted) setLoading(false);
      });

    const subscription = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, newSession: Session | null) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      },
    );

    return () => {
      isMounted = false;
      subscription.data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function syncProfile() {
      if (!user) {
        setProfile(null);
        return;
      }

      try {
        const data = await fetchCurrentUser();
        if (!cancelled) {
          setProfile(data);
        }
      } catch (error) {
        console.warn('Failed to sync user profile', error);
        if (!cancelled) {
          setProfile((prev) => prev ?? null);
        }
      }
    }

    void syncProfile();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      session,
      user,
      profile,
      signIn: async (email: string, password: string) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      },
      signUp: async (email: string, password: string) => {
        const trimmedEmail = email.trim();
        const { data, error } = await supabase.auth.signUp({ email: trimmedEmail, password });
        if (error) throw error;

        const sessionFromSignUp = data.session ?? null;
        if (sessionFromSignUp) {
          setSession(sessionFromSignUp);
          setUser(sessionFromSignUp.user ?? null);
          return;
        }

        if (data.user) {
          const { error: signInError, data: signInData } = await supabase.auth.signInWithPassword({
            email: trimmedEmail,
            password,
          });
          if (signInError) throw signInError;

          if (signInData.session) {
            setSession(signInData.session);
            setUser(signInData.session.user ?? null);
          }
        }
      },
      signOut: async () => {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      },
    }),
    [loading, session, user, profile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
