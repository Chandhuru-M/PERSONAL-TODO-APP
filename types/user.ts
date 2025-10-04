export interface UserProfile {
  id: string;
  email: string;
  created_at?: string;
  updated_at?: string | null;
  [key: string]: unknown;
}
