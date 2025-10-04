export interface Profile {
  id: string;
  email: string;
  created_at: string;
  updated_at?: string | null;
  [key: string]: unknown;
}
