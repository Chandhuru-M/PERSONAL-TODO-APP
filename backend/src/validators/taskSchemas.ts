import { z } from 'zod';

const isoDateString = z.string().datetime({ offset: true }).optional().nullable();

export const createTaskSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().max(500).optional().nullable(),
  due_at: isoDateString,
  reminder_at: isoDateString,
});

export const updateTaskSchema = createTaskSchema.partial();

export const statusQuerySchema = z.object({
  status: z.enum(['all', 'today', 'upcoming', 'completed']).default('all'),
});

export const toggleCompleteSchema = z.object({
  is_completed: z.boolean(),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type StatusQueryInput = z.infer<typeof statusQuerySchema>;
export type ToggleCompleteInput = z.infer<typeof toggleCompleteSchema>;
