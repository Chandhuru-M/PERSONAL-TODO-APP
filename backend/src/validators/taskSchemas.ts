import { z } from 'zod';

const isoDateString = z.string().datetime({ offset: true }).optional().nullable();

export const createTaskSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().max(500).optional().nullable(),
  due_at: isoDateString,
  reminder_at: isoDateString,
});

export const updateTaskSchema = createTaskSchema.partial();

const booleanLike = z
  .union([z.literal('true'), z.literal('false')])
  .optional()
  .transform((value) => value === 'true');

export const taskQuerySchema = z
  .object({
    start: z.string().datetime({ offset: true }).optional(),
    end: z.string().datetime({ offset: true }).optional(),
    includeCompleted: booleanLike,
  })
  .transform(({ start, end, includeCompleted }) => ({
    start,
    end,
    includeCompleted: includeCompleted ?? false,
  }));

export const toggleCompleteSchema = z.object({
  is_completed: z.boolean(),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type TaskQueryInput = z.infer<typeof taskQuerySchema>;
export type ToggleCompleteInput = z.infer<typeof toggleCompleteSchema>;
