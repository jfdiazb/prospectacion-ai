import { Router } from 'express';
import { authMiddleware, type AuthRequest } from '../middlewares/auth';
import { apiLimiter } from '../middlewares/rateLimiter';
import Conversation from '../models/Conversation';
import Activity from '../models/Activity';
import Meeting from '../models/Meeting';
import Task from '../models/Task';

const router = Router();
router.use(authMiddleware, apiLimiter);

router.get('/conversations', async (req: AuthRequest, res, next) => {
  try {
    const data = await Conversation.find({ userId: req.userId }).populate('leadId').sort({ lastMessage: -1 });
    res.json({ success: true, data });
  } catch (error) { next(error); }
});

router.get('/activities', async (req: AuthRequest, res, next) => {
  try {
    const data = await Activity.find({ userId: req.userId }).populate('leadId').sort({ createdAt: -1 }).limit(200);
    res.json({ success: true, data });
  } catch (error) { next(error); }
});

router.get('/meetings', async (req: AuthRequest, res, next) => {
  try {
    const data = await Meeting.find({ userId: req.userId }).populate('leadId').sort({ createdAt: -1 });
    res.json({ success: true, data });
  } catch (error) { next(error); }
});

router.get('/tasks', async (req: AuthRequest, res, next) => {
  try {
    const data = await Task.find({ userId: req.userId }).populate('leadId').sort({ dueDate: 1, createdAt: -1 });
    res.json({ success: true, data });
  } catch (error) { next(error); }
});

export default router;
