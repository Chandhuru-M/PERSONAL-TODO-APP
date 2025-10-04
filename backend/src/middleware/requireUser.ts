import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { type NextFunction, type Request, type Response } from 'express';

import { ENV } from '../env.js';
import { upsertProfile } from '../services/profileService.js';
import { supabase } from '../services/supabaseClient.js';

export type AuthedRequest = Request & {
  userId: string;
  userEmail: string;
  accessToken: string;
  userSupabase: SupabaseClient;
};

declare module 'express-serve-static-core' {
  interface Request {
    userId?: string;
    userEmail?: string;
    accessToken?: string;
    userSupabase?: SupabaseClient;
  }
}

const AUTH_HEADER = 'authorization';

export async function requireUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.header(AUTH_HEADER);

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.replace('Bearer', '').trim();

  try {
    const { data, error } = await supabase.auth.getUser(token);
    const user = data.user;
    if (error || !user) {
      res.status(401).json({ error: 'Invalid or expired session' });
      return;
    }

    req.userId = user.id;
    req.userEmail = user.email ?? '';
    req.accessToken = token;
    req.userSupabase = createUserSupabaseClient(token);

    if (req.userEmail) {
      try {
        await upsertProfile(req.userId, req.userEmail);
      } catch (profileError) {
        console.warn('Profile sync failed', profileError);
      }
    }
    next();
  } catch (err) {
    console.error('Failed to verify Supabase user', err);
    next(err);
  }
}

function createUserSupabaseClient(accessToken: string): SupabaseClient {
  return createClient(ENV.SUPABASE_URL, ENV.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}
