export interface Task {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  due_at: string | null;
  reminder_at: string | null;
  is_completed: boolean;
  created_at: string;
  updated_at: string;
}

export type TaskStatusFilter = 'all' | 'today' | 'upcoming' | 'completed';
