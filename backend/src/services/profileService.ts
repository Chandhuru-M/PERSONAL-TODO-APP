import type { PostgrestError } from '@supabase/supabase-js';

import type { Profile } from '../types/profile.js';
import { supabase } from './supabaseClient.js';

const PROFILES_TABLE = 'profiles';

export async function upsertProfile(id: string, email: string): Promise<Profile> {
  const { data, error } = await supabase
    .from(PROFILES_TABLE)
    .upsert(
      {
        id,
        email,
      },
      { onConflict: 'id' },
    )
    .select('*')
    .single();

  if (error) {
    if (isMissingTableError(error)) {
      return { id, email, created_at: new Date().toISOString() };
    }
    throw error;
  }

  return data as Profile;
}

export async function getProfile(id: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from(PROFILES_TABLE)
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    throw error;
  }

  return (data ?? null) as Profile | null;
}

function isMissingTableError(error: unknown): boolean {
  if (error && typeof error === 'object') {
    const code = (error as PostgrestError).code;
    return code === 'PGRST205' || code === '42P01';
  }
  return false;
}
