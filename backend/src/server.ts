import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';

import { ENV } from './env.js';
import { tasksRouter } from './routes/tasks.js';
import { usersRouter } from './routes/users.js';
import { supabase } from './services/supabaseClient.js';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Deep health check that verifies Supabase connectivity with the service role
app.get('/health/supabase', async (_req: Request, res: Response) => {
  try {
    const { error } = await supabase.from('tasks').select('id', { count: 'exact', head: true });
    if (error) {
      res.status(500).json({ status: 'error', source: 'supabase', message: error.message });
      return;
    }
    res.status(200).json({ status: 'ok', source: 'supabase' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ status: 'error', source: 'supabase', message });
  }
});

app.use('/api/tasks', tasksRouter);
app.use('/api/users', usersRouter);

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(ENV.PORT, () => {
  console.log(`[server] listening on http://localhost:${ENV.PORT}`);
});
