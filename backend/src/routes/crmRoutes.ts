import { Router } from 'express';
import { authMiddleware, type AuthRequest } from '../middlewares/auth';
import { apiLimiter } from '../middlewares/rateLimiter';
import Conversation from '../models/Conversation';
import Activity from '../models/Activity';
import Meeting from '../models/Meeting';
import { TaskService } from '../services/TaskService';
import Task from '../models/Task';
import crypto from 'crypto';
import { MessagingService } from '../services/MessagingService';
import { ConversationService } from '../services/ConversationService';

const router = Router();
router.use(authMiddleware, apiLimiter);

router.get('/conversations', async (req: AuthRequest, res, next) => {
  try {
    const data = await Conversation.find({ userId: req.userId }).populate('leadId').sort({ lastMessage: -1 });
    res.json({ success: true, data });
  } catch (error) { next(error); }
});

router.patch('/conversations/:conversationId/control', async (req: AuthRequest, res, next) => {
  try {
    const action = req.body?.action;
    if (!['take', 'resume'].includes(action)) return res.status(400).json({ success: false, message: 'La acción debe ser take o resume' });
    const now = new Date();
    const update = action === 'take'
      ? { $set: { controlMode: 'human_controlled', humanControlStartedAt: now } }
      : { $set: { controlMode: 'automated', automationResumedAt: now }, $unset: { handoffReason: 1, handoffRequestedAt: 1, humanControlStartedAt: 1 } };
    const conversation: any = await Conversation.findOneAndUpdate(
      { _id: req.params.conversationId, userId: req.userId }, update, { new: true },
    ).populate('leadId');
    if (!conversation) return res.status(404).json({ success: false, message: 'Conversación no encontrada' });
    await Activity.create({
      userId: req.userId, leadId: conversation.leadId._id, conversationId: conversation._id, type: 'control_changed',
      description: action === 'take' ? 'El usuario tomó el control de la conversación' : 'El usuario devolvió la conversación a ALMA',
      metadata: { controlMode: conversation.controlMode },
    });
    if (action === 'resume') await Task.updateMany({
      userId: req.userId, conversationId: conversation._id, type: 'other', status: 'pending', 'metadata.handoffReason': { $exists: true },
    }, { $set: { status: 'completed' } });
    return res.json({ success: true, data: conversation });
  } catch (error) { next(error); }
});

router.post('/conversations/:conversationId/messages', async (req: AuthRequest, res, next) => {
  try {
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (!text || text.length > 1000) return res.status(400).json({ success: false, message: 'El mensaje debe contener entre 1 y 1000 caracteres' });
    const conversation: any = await Conversation.findOne({ _id: req.params.conversationId, userId: req.userId }).populate('leadId');
    if (!conversation) return res.status(404).json({ success: false, message: 'Conversación no encontrada' });
    if (conversation.controlMode !== 'human_controlled') return res.status(409).json({ success: false, message: 'Debes tomar el control antes de responder' });
    if (conversation.leadId?.platform !== 'whatsapp' || !conversation.leadId?.phone) return res.status(400).json({ success: false, message: 'El envío humano está disponible actualmente para WhatsApp' });
    const deliveryStatus = await MessagingService.send({
      userId: req.userId as string, leadId: conversation.leadId._id.toString(), conversationId: conversation._id.toString(),
      sourceEventId: `human:${crypto.randomUUID()}`, text, recipient: { type: 'whatsapp_user', phoneNumber: conversation.leadId.phone },
    });
    if (deliveryStatus === 'failed') return res.status(502).json({ success: false, message: 'WhatsApp rechazó el mensaje; ALMA continúa pausada' });
    const updated = await ConversationService.addMessage(conversation._id.toString(), req.userId as string, { sender: 'user', text, platform: 'whatsapp' });
    await Activity.create({ userId: req.userId, leadId: conversation.leadId._id, conversationId: conversation._id, type: 'message_generated', description: 'El usuario respondió manualmente por WhatsApp', metadata: { deliveryStatus, responseSource: 'human' } });
    return res.status(201).json({ success: true, data: updated });
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
    const data = await TaskService.getUserTasks(req.userId as string);
    await Promise.all(data.map((task: any) => task.populate('leadId')));
    res.json({ success: true, data });
  } catch (error) { next(error); }
});

export default router;
