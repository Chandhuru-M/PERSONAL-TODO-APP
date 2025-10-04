export type TaskStatus = 'all' | 'today' | 'upcoming' | 'completed';

export interface Task {
  id: string;
  title: string;
  description: string | null;
  due_at: string | null;
  reminder_at: string | null;
  is_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface TaskSummary {
  count: number;
  tasks: Task[];
}
