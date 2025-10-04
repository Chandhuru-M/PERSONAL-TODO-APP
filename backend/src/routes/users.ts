import { Router } from 'express';

import { requireUser } from '../middleware/requireUser.js';
import { getProfile, upsertProfile } from '../services/profileService.js';

export const usersRouter = Router();

usersRouter.use(requireUser);

usersRouter.get('/me', async (req, res, next) => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const email = req.userEmail ?? '';
    let profile = await getProfile(req.userId);

    if (!profile && email) {
      profile = await upsertProfile(req.userId, email);
    }

    res.json({ data: profile ?? { id: req.userId, email } });
  } catch (error) {
    next(error);
  }
});
