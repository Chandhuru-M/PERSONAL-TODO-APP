import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';

import { ENV } from './env.js';
import { tasksRouter } from './routes/tasks.js';
import { usersRouter } from './routes/users.js';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
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
