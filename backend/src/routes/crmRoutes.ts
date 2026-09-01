import { Router } from 'express';
import crypto from 'crypto';
import { authMiddleware, type AuthRequest } from '../middlewares/auth';
import { apiLimiter } from '../middlewares/rateLimiter';
import Conversation from '../models/Conversation';
import Activity from '../models/Activity';
import Meeting from '../models/Meeting';
import Task from '../models/Task';
import AssistedProposal from '../models/AssistedProposal';
import Lead from '../models/Lead';
import QualificationHistory from '../models/QualificationHistory';
import { TaskService } from '../services/TaskService';
import { MessagingService } from '../services/MessagingService';
import { ConversationService } from '../services/ConversationService';
import type { MessagingRecipient } from '../integrations/messaging';
import { MeetingLifecycleService } from '../services/MeetingLifecycleService';
import { ReactivationService } from '../services/ReactivationService';
import { MeetingAutomationService } from '../services/MeetingAutomationService';
import { MultichannelIdentityService } from '../services/MultichannelIdentityService';
import DuplicateCandidate from '../models/DuplicateCandidate';
import IdentityAudit from '../models/IdentityAudit';
import { LaunchActionService } from '../services/LaunchActionService';
import { ProposalRoutingError, ProposalRoutingService } from '../services/ProposalRoutingService';

const router = Router();
router.use(authMiddleware, apiLimiter);

router.get('/conversations', async (req: AuthRequest, res, next) => {
  try {
    const conversations: any[] = await Conversation.find({ userId: req.userId })
      .populate('leadId')
      .sort({ lastMessage: -1 })
      .lean();
    const proposals: any[] = await AssistedProposal.find({
      userId: req.userId,
      conversationId: { $in: conversations.map(item => item._id) },
    })
      .sort({ createdAt: -1 })
      .lean();
    const qualificationHistory: any[] = await QualificationHistory.find({
      userId: req.userId,
      leadId: { $in: conversations.map(item => item.leadId?._id).filter(Boolean) },
      processingState: 'completed',
    })
      .sort({ evaluatedAt: -1 })
      .lean();
    const latest = new Map<string, any>();
    for (const proposal of proposals)
      if (!latest.has(proposal.conversationId.toString()))
        latest.set(proposal.conversationId.toString(), proposal);
    const latestQualification = new Map<string, any>();
    for (const entry of qualificationHistory)
      if (!latestQualification.has(entry.leadId.toString()))
        latestQualification.set(entry.leadId.toString(), entry);
    const contacts = await MultichannelIdentityService.list(req.userId!);
    const identityByLead = new Map<string, any>();
    for (const contact of contacts)
      for (const identity of contact.identities)
        identityByLead.set(identity.leadId?._id?.toString() || identity.leadId?.toString(), {
          contactId: contact._id,
          preferredChannel: contact.preferredChannel,
          generalOptOut: contact.generalOptOut,
          identities: contact.identities.map((entry: any) => ({
            _id: entry._id,
            platform: entry.platform,
            leadId: entry.leadId?._id || entry.leadId,
            consentStatus: entry.consentStatus,
          })),
        });
    res.json({
      success: true,
      data: conversations.map(item => ({
        ...item,
        proposedResponse: latest.get(item._id.toString()),
        latestQualification: item.leadId?._id
          ? latestQualification.get(item.leadId._id.toString())
          : undefined,
        identityContext: item.leadId?._id
          ? identityByLead.get(item.leadId._id.toString())
          : undefined,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.patch(
  '/conversations/:conversationId/proposals/:proposalId',
  async (req: AuthRequest, res, next) => {
    try {
      const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
      if (!text || text.length > 1000)
        return res
          .status(400)
          .json({
            success: false,
            message: 'La propuesta debe contener entre 1 y 1000 caracteres',
          });
      const candidate: any = await AssistedProposal.findOne({
        _id: req.params.proposalId,
        conversationId: req.params.conversationId,
        userId: req.userId,
        status: { $in: ['proposed', 'failed'] },
      });
      if (candidate) {
        const validation = await ReactivationService.validateProposal(candidate);
        if (!validation.valid) {
          await ReactivationService.invalidateProposal(
            candidate._id,
            validation.reason || 'context_changed'
          );
          return res
            .status(409)
            .json({
              success: false,
              message: 'La propuesta caducó porque cambió el contexto de la conversación',
            });
        }
        const meetingValidation = await MeetingAutomationService.validateProposal(candidate);
        if (!meetingValidation.valid) {
          await MeetingAutomationService.invalidateProposal(
            candidate._id,
            meetingValidation.reason || 'context_changed'
          );
          return res
            .status(409)
            .json({ success: false, message: 'La propuesta caducó porque cambió la reunión' });
        }
        const launchValidation = await LaunchActionService.validateProposal(candidate);
        if (!launchValidation.valid) {
          await LaunchActionService.invalidateProposal(candidate._id, launchValidation.reason || 'context_changed');
          return res.status(409).json({ success: false, message: 'La propuesta caducó porque cambió el lanzamiento' });
        }
        const multichannelValidation =
          await MultichannelIdentityService.validateProposal(candidate);
        if (!multichannelValidation.valid) {
          await AssistedProposal.updateOne(
            { _id: candidate._id },
            {
              $set: {
                status: 'cancelled',
                invalidatedAt: new Date(),
                invalidationReason: multichannelValidation.reason,
                errorMessage: `Propuesta caducada: ${multichannelValidation.reason}`,
              },
            }
          );
          return res
            .status(409)
            .json({ success: false, message: 'La propuesta caducó por una política multicanal' });
        }
      }
      const proposal = await AssistedProposal.findOneAndUpdate(
        {
          _id: req.params.proposalId,
          conversationId: req.params.conversationId,
          userId: req.userId,
          status: { $in: ['proposed', 'failed'] },
        },
        {
          $set: { text, editedAt: new Date(), status: 'proposed' },
          $unset: { errorMessage: 1, failedAt: 1 },
        },
        { new: true }
      );
      if (!proposal)
        return res
          .status(409)
          .json({ success: false, message: 'La propuesta no existe o ya no puede editarse' });
      return res.json({ success: true, data: proposal });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/conversations/:conversationId/proposals/:proposalId/send',
  async (req: AuthRequest, res, next) => {
    try {
      const candidate: any = await AssistedProposal.findOne({
        _id: req.params.proposalId,
        conversationId: req.params.conversationId,
        userId: req.userId,
        status: { $in: ['proposed', 'failed'] },
      });
      if (candidate) {
        const validation = await ReactivationService.validateProposal(candidate);
        if (!validation.valid) {
          await ReactivationService.invalidateProposal(
            candidate._id,
            validation.reason || 'context_changed'
          );
          return res
            .status(409)
            .json({
              success: false,
              message: 'La propuesta caducó porque cambió el contexto de la conversación',
            });
        }
        const meetingValidation = await MeetingAutomationService.validateProposal(candidate);
        if (!meetingValidation.valid) {
          await MeetingAutomationService.invalidateProposal(
            candidate._id,
            meetingValidation.reason || 'context_changed'
          );
          return res
            .status(409)
            .json({ success: false, message: 'La propuesta caducó porque cambió la reunión' });
        }
        const launchValidation = await LaunchActionService.validateProposal(candidate);
        if (!launchValidation.valid) {
          await LaunchActionService.invalidateProposal(candidate._id, launchValidation.reason || 'context_changed');
          return res.status(409).json({ success: false, message: 'La propuesta caducó porque cambió el lanzamiento' });
        }
        const multichannelValidation =
          await MultichannelIdentityService.validateProposal(candidate);
        if (!multichannelValidation.valid) {
          await AssistedProposal.updateOne(
            { _id: candidate._id },
            {
              $set: {
                status: 'cancelled',
                invalidatedAt: new Date(),
                invalidationReason: multichannelValidation.reason,
                errorMessage: `Propuesta caducada: ${multichannelValidation.reason}`,
              },
            }
          );
          return res
            .status(409)
            .json({ success: false, message: 'La propuesta caducó por una política multicanal' });
        }
      }
      const proposal: any = await AssistedProposal.findOneAndUpdate(
        {
          _id: req.params.proposalId,
          conversationId: req.params.conversationId,
          userId: req.userId,
          status: { $in: ['proposed', 'failed'] },
        },
        { $set: { status: 'sending', approvedAt: new Date() } },
        { new: true }
      ).populate('leadId');
      if (!proposal)
        return res
          .status(409)
          .json({ success: false, message: 'La propuesta ya fue enviada o está siendo procesada' });
      const conversation: any = await Conversation.findOne({ _id: proposal.conversationId, userId: req.userId }).lean();
      let route;
      try {
        route = ProposalRoutingService.resolve(proposal, conversation);
      } catch (error) {
        const routingError = error instanceof ProposalRoutingError
          ? error
          : new ProposalRoutingError('No fue posible validar el canal de la propuesta', 'PROPOSAL_ROUTING_ERROR');
        await AssistedProposal.updateOne(
          { _id: proposal._id },
          {
            status: 'failed',
            failedAt: new Date(),
            errorMessage: routingError.message,
          }
        );
        return res
          .status(409)
          .json({
            success: false,
            message: routingError.message,
            code: routingError.code,
          });
      }
      const { channel: platform, recipient } = route;
      const deliveryStatus = await MessagingService.send({
        userId: req.userId as string,
        leadId: proposal.leadId._id.toString(),
        conversationId: proposal.conversationId.toString(),
        sourceEventId: `proposal:${proposal._id}`,
        text: proposal.text,
        recipient,
      });
      if (deliveryStatus === 'failed') {
        await AssistedProposal.updateOne(
          { _id: proposal._id },
          {
            status: 'failed',
            failedAt: new Date(),
            deliveryStatus,
            errorMessage: `${platform} rechazó el envío`,
          }
        );
        return res
          .status(502)
          .json({
            success: false,
            message: `${platform} rechazó el mensaje; la propuesta permanece disponible para revisión`,
          });
      }
      const proposalStatus = ProposalRoutingService.proposalStatus(deliveryStatus);
      await AssistedProposal.updateOne(
        { _id: proposal._id },
        {
          status: proposalStatus,
          deliveryStatus,
          ...(proposalStatus === 'sent' ? { sentAt: new Date() } : {}),
        }
      );
      const followUpScheduledAt = new Date();
      await Lead.updateOne(
        { _id: proposal.leadId._id, userId: req.userId, status: { $ne: 'rejected' } },
        {
          $set: {
            lastContact: followUpScheduledAt,
            nextFollowUp: new Date(followUpScheduledAt.getTime() + 86400000),
            'followUp.scheduledAt': followUpScheduledAt,
            'followUp.lastDecision': 'scheduled',
            'followUp.lastReason': 'assisted_message_sent',
          },
        }
      );
      await ConversationService.addMessage(
        proposal.conversationId.toString(),
        req.userId as string,
        {
          sender: 'user',
          text: proposal.text,
          platform,
          direction: 'outbound',
          status: deliveryStatus === 'sent' ? 'sent' : 'simulated',
          relatedMessageId: proposal.sourceEventId,
        }
      );
      await Activity.create({
        userId: req.userId,
        leadId: proposal.leadId._id,
        conversationId: proposal.conversationId,
        type: 'message_generated',
        description: `Respuesta asistida aprobada y enviada por ${platform}`,
        metadata: { deliveryStatus, responseSource: 'assisted_approved', platform },
      });
      console.info('Assisted proposal delivery completed', { platform, deliveryStatus });
      return res.json({ success: true, data: await AssistedProposal.findById(proposal._id) });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/conversations/:conversationId/proposals/:proposalId/discard',
  async (req: AuthRequest, res, next) => {
    try {
      const proposal = await AssistedProposal.findOneAndUpdate(
        {
          _id: req.params.proposalId,
          conversationId: req.params.conversationId,
          userId: req.userId,
          status: { $in: ['proposed', 'failed'] },
        },
        { $set: { status: 'cancelled', errorMessage: 'Descartada por revisión humana' } },
        { new: true }
      );
      if (!proposal)
        return res
          .status(409)
          .json({ success: false, message: 'La propuesta no existe o ya no puede descartarse' });
      return res.json({ success: true, data: proposal });
    } catch (error) {
      next(error);
    }
  }
);

router.patch('/conversations/:conversationId/control', async (req: AuthRequest, res, next) => {
  try {
    const action = req.body?.action;
    if (!['take', 'resume'].includes(action))
      return res.status(400).json({ success: false, message: 'La acción debe ser take o resume' });
    const now = new Date();
    const update =
      action === 'take'
        ? { $set: { controlMode: 'human_controlled', humanControlStartedAt: now } }
        : {
            $set: { controlMode: 'automated', automationResumedAt: now },
            $unset: { handoffReason: 1, handoffRequestedAt: 1, humanControlStartedAt: 1 },
          };
    const conversation: any = await Conversation.findOneAndUpdate(
      { _id: req.params.conversationId, userId: req.userId },
      update,
      { new: true }
    ).populate('leadId');
    if (!conversation)
      return res.status(404).json({ success: false, message: 'Conversación no encontrada' });
    await Activity.create({
      userId: req.userId,
      leadId: conversation.leadId._id,
      conversationId: conversation._id,
      type: 'control_changed',
      description:
        action === 'take'
          ? 'El usuario tomó el control de la conversación'
          : 'El usuario devolvió la conversación a ALMA',
      metadata: { controlMode: conversation.controlMode },
    });
    if (action === 'resume')
      await Task.updateMany(
        {
          userId: req.userId,
          conversationId: conversation._id,
          type: 'other',
          status: 'pending',
          'metadata.handoffReason': { $exists: true },
        },
        { $set: { status: 'completed' } }
      );
    return res.json({ success: true, data: conversation });
  } catch (error) {
    next(error);
  }
});

router.post('/conversations/:conversationId/messages', async (req: AuthRequest, res, next) => {
  try {
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (!text || text.length > 1000)
      return res
        .status(400)
        .json({ success: false, message: 'El mensaje debe contener entre 1 y 1000 caracteres' });
    const conversation: any = await Conversation.findOne({
      _id: req.params.conversationId,
      userId: req.userId,
    }).populate('leadId');
    if (!conversation)
      return res.status(404).json({ success: false, message: 'Conversación no encontrada' });
    if (conversation.controlMode !== 'human_controlled')
      return res
        .status(409)
        .json({ success: false, message: 'Debes tomar el control antes de responder' });
    const platform = conversation.leadId?.platform;
    const recipient: MessagingRecipient | null =
      platform === 'whatsapp' && conversation.leadId?.phone
        ? { type: 'whatsapp_user', phoneNumber: conversation.leadId.phone }
        : platform === 'instagram' && conversation.leadId?.username
          ? { type: 'instagram_user', instagramScopedId: conversation.leadId.username }
          : platform === 'facebook' && conversation.leadId?.username
            ? { type: 'facebook_user', pageScopedId: conversation.leadId.username }
            : null;
    if (!recipient)
      return res
        .status(400)
        .json({
          success: false,
          message: 'El canal no conserva un destinatario oficial válido para envío humano',
        });
    const deliveryStatus = await MessagingService.send({
      userId: req.userId as string,
      leadId: conversation.leadId._id.toString(),
      conversationId: conversation._id.toString(),
      sourceEventId: `human:${crypto.randomUUID()}`,
      text,
      recipient,
    });
    if (deliveryStatus === 'failed')
      return res
        .status(502)
        .json({ success: false, message: `${platform} rechazó el mensaje; ALMA continúa pausada` });
    const updated = await ConversationService.addMessage(
      conversation._id.toString(),
      req.userId as string,
      {
        sender: 'user',
        text,
        platform,
        direction: 'outbound',
        status: deliveryStatus === 'sent' ? 'sent' : 'pending',
      }
    );
    const followUpScheduledAt = new Date();
    await Lead.updateOne(
      { _id: conversation.leadId._id, userId: req.userId, status: { $ne: 'rejected' } },
      {
        $set: {
          lastContact: followUpScheduledAt,
          nextFollowUp: new Date(followUpScheduledAt.getTime() + 86400000),
          'followUp.scheduledAt': followUpScheduledAt,
          'followUp.lastDecision': 'scheduled',
          'followUp.lastReason': 'human_message_sent',
        },
      }
    );
    await Activity.create({
      userId: req.userId,
      leadId: conversation.leadId._id,
      conversationId: conversation._id,
      type: 'message_generated',
      description: `El usuario respondió manualmente por ${platform}`,
      metadata: { deliveryStatus, responseSource: 'human', platform },
    });
    return res.status(201).json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

router.get('/activities', async (req: AuthRequest, res, next) => {
  try {
    res.json({
      success: true,
      data: await Activity.find({ userId: req.userId })
        .populate('leadId')
        .sort({ createdAt: -1 })
        .limit(200),
    });
  } catch (error) {
    next(error);
  }
});
router.get('/meetings', async (req: AuthRequest, res, next) => {
  try {
    res.json({
      success: true,
      data: await Meeting.find({ userId: req.userId }).populate('leadId').sort({ createdAt: -1 }),
    });
  } catch (error) {
    next(error);
  }
});
router.post('/meetings/:meetingId/retry', async (req: AuthRequest, res, next) => {
  try {
    const meeting: any = await Meeting.findOne({ _id: req.params.meetingId, userId: req.userId });
    if (!meeting) return res.status(404).json({ success: false, message: 'Reunión no encontrada' });
    await new MeetingLifecycleService().confirm({
      userId: req.userId!,
      leadId: meeting.leadId.toString(),
      conversationId: meeting.conversationId.toString(),
      sourceEventId: `crm-retry:${meeting._id}`,
      platform: meeting.originChannel,
      timezone: meeting.timezone,
      attendeeEmail: meeting.attendeeEmail,
    });
    const safeMeeting = await Meeting.findOne({ _id: meeting._id, userId: req.userId });
    return res.json({ success: true, data: safeMeeting });
  } catch (error) {
    next(error);
  }
});
router.post('/meetings/:meetingId/cancel', async (req: AuthRequest, res, next) => {
  try {
    const meeting = await new MeetingLifecycleService().cancel(req.userId!, req.params.meetingId);
    return meeting
      ? res.json({ success: true, data: meeting })
      : res.status(404).json({ success: false, message: 'Reunión no encontrada' });
  } catch (error) {
    next(error);
  }
});
router.post('/meetings/:meetingId/reschedule', async (req: AuthRequest, res, next) => {
  try {
    const meeting: any = await Meeting.findOne({ _id: req.params.meetingId, userId: req.userId });
    if (!meeting) return res.status(404).json({ success: false, message: 'Reunión no encontrada' });
    const outcome = await new MeetingLifecycleService().requestReschedule({
      userId: req.userId!,
      leadId: meeting.leadId.toString(),
      conversationId: meeting.conversationId.toString(),
      sourceEventId: `crm-reschedule:${meeting._id}`,
      platform: meeting.originChannel,
      timezone: meeting.timezone,
      attendeeEmail: meeting.attendeeEmail,
    });
    return res.json({ success: true, data: outcome.meeting });
  } catch (error) {
    next(error);
  }
});
router.post('/meetings/:meetingId/complete', async (req: AuthRequest, res, next) => {
  try {
    const meeting = await new MeetingLifecycleService().complete(req.userId!, req.params.meetingId);
    return meeting
      ? res.json({ success: true, data: meeting })
      : res.status(409).json({ success: false, message: 'La reunión no puede completarse' });
  } catch (error) {
    next(error);
  }
});
router.post('/meetings/:meetingId/no-show', async (req: AuthRequest, res, next) => {
  try {
    const actor = ['prospect', 'host', 'unknown'].includes(req.body?.actor)
      ? req.body.actor
      : 'unknown';
    const reason =
      typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 500) : undefined;
    const meeting = await new MeetingLifecycleService().markNoShow(
      req.userId!,
      req.params.meetingId,
      actor,
      reason
    );
    return meeting
      ? res.json({ success: true, data: meeting })
      : res.status(409).json({ success: false, message: 'La reunión no admite registrar no-show' });
  } catch (error) {
    next(error);
  }
});
router.post('/meetings/:meetingId/technical-failure', async (req: AuthRequest, res, next) => {
  try {
    const reason =
      typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 500) : undefined;
    const meeting = await new MeetingLifecycleService().markTechnicalFailure(
      req.userId!,
      req.params.meetingId,
      reason
    );
    return meeting
      ? res.json({ success: true, data: meeting })
      : res
          .status(409)
          .json({ success: false, message: 'La reunión no admite registrar fallo técnico' });
  } catch (error) {
    next(error);
  }
});
router.get('/tasks', async (req: AuthRequest, res, next) => {
  try {
    const data = await TaskService.getUserTasks(req.userId as string);
    await Promise.all(data.map((task: any) => task.populate('leadId')));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});
router.patch('/tasks/:taskId/status', async (req: AuthRequest, res, next) => {
  try {
    const status = req.body?.status;
    if (!['pending', 'completed'].includes(status))
      return res
        .status(400)
        .json({ success: false, message: 'El estado debe ser pending o completed' });
    const task = await Task.findOneAndUpdate(
      { _id: req.params.taskId, userId: req.userId },
      { $set: { status } },
      { new: true }
    ).populate('leadId');
    if (!task) return res.status(404).json({ success: false, message: 'Tarea no encontrada' });
    return res.json({ success: true, data: task });
  } catch (error) {
    next(error);
  }
});

router.get('/contacts', async (req: AuthRequest, res, next) => {
  try {
    res.json({ success: true, data: await MultichannelIdentityService.list(req.userId!) });
  } catch (error) {
    next(error);
  }
});
router.get('/identity-audit', async (req: AuthRequest, res, next) => {
  try {
    res.json({
      success: true,
      data: await IdentityAudit.find({ userId: req.userId }).sort({ createdAt: -1 }).limit(200),
    });
  } catch (error) {
    next(error);
  }
});
router.get('/duplicate-candidates', async (req: AuthRequest, res, next) => {
  try {
    await MultichannelIdentityService.detectCandidates();
    res.json({
      success: true,
      data: await DuplicateCandidate.find({ userId: req.userId, status: 'pending' })
        .populate('leadAId leadBId')
        .sort({ createdAt: -1 }),
    });
  } catch (error) {
    next(error);
  }
});
router.post('/duplicate-candidates/:candidateId/confirm', async (req: AuthRequest, res, next) => {
  try {
    const candidate: any = await DuplicateCandidate.findOne({
      _id: req.params.candidateId,
      userId: req.userId,
      status: 'pending',
    });
    if (!candidate)
      return res.status(404).json({ success: false, message: 'Posible duplicado no encontrado' });
    const data = await MultichannelIdentityService.linkLeads(
      req.userId!,
      [candidate.leadAId.toString(), candidate.leadBId.toString()],
      req.userId!,
      'crm_duplicate_confirmation',
      typeof req.body?.reason === 'string' ? req.body.reason : undefined
    );
    return res.json({ success: true, data });
  } catch (error: any) {
    if (/identidad|contactos confirmados|leads/i.test(error?.message || ''))
      return res.status(409).json({ success: false, message: error.message });
    next(error);
  }
});
router.post('/duplicate-candidates/:candidateId/reject', async (req: AuthRequest, res, next) => {
  try {
    const data = await MultichannelIdentityService.rejectCandidate(
      req.userId!,
      req.params.candidateId,
      req.userId!,
      typeof req.body?.reason === 'string' ? req.body.reason : undefined
    );
    return data
      ? res.json({ success: true, data })
      : res.status(404).json({ success: false, message: 'Posible duplicado no encontrado' });
  } catch (error) {
    next(error);
  }
});
router.post('/contacts/link', async (req: AuthRequest, res, next) => {
  try {
    const leadIds = Array.isArray(req.body?.leadIds) ? req.body.leadIds.map(String) : [];
    const data = await MultichannelIdentityService.linkLeads(
      req.userId!,
      leadIds,
      req.userId!,
      'crm_explicit_link',
      typeof req.body?.reason === 'string' ? req.body.reason : undefined
    );
    return res.status(201).json({ success: true, data });
  } catch (error: any) {
    return res
      .status(409)
      .json({ success: false, message: error?.message || 'No fue posible crear el vínculo' });
  }
});
router.post('/contacts/:contactId/preferred-channel', async (req: AuthRequest, res, next) => {
  try {
    const allowed = ['whatsapp', 'instagram', 'facebook', 'youtube', 'telegram', 'manual'];
    const channel = req.body?.channel == null ? null : String(req.body.channel);
    if (channel && !allowed.includes(channel))
      return res.status(400).json({ success: false, message: 'Canal no soportado' });
    const data = await MultichannelIdentityService.setPreferredChannel(
      req.userId!,
      req.params.contactId,
      channel as any,
      req.userId!
    );
    return data
      ? res.json({ success: true, data })
      : res.status(404).json({ success: false, message: 'Contacto no encontrado' });
  } catch (error: any) {
    return res
      .status(409)
      .json({ success: false, message: error?.message || 'Preferencia inválida' });
  }
});
router.post('/contacts/:contactId/opt-out', async (req: AuthRequest, res, next) => {
  try {
    const data = await MultichannelIdentityService.setGeneralOptOut(
      req.userId!,
      req.params.contactId,
      Boolean(req.body?.optedOut),
      req.userId!,
      typeof req.body?.reason === 'string' ? req.body.reason : undefined
    );
    return data
      ? res.json({ success: true, data })
      : res.status(404).json({ success: false, message: 'Contacto no encontrado' });
  } catch (error) {
    next(error);
  }
});
router.post('/identities/:identityId/consent', async (req: AuthRequest, res, next) => {
  try {
    const status = req.body?.status;
    if (!['unknown', 'consented', 'opted_out', 'blocked'].includes(status))
      return res.status(400).json({ success: false, message: 'Estado de consentimiento inválido' });
    const data = await MultichannelIdentityService.setChannelConsent(
      req.userId!,
      req.params.identityId,
      status,
      req.userId!,
      typeof req.body?.reason === 'string' ? req.body.reason : undefined
    );
    return data
      ? res.json({ success: true, data })
      : res.status(404).json({ success: false, message: 'Identidad no encontrada' });
  } catch (error) {
    next(error);
  }
});
router.post('/identities/:identityId/unlink', async (req: AuthRequest, res, next) => {
  try {
    const data = await MultichannelIdentityService.unlink(
      req.userId!,
      req.params.identityId,
      req.userId!,
      typeof req.body?.reason === 'string' ? req.body.reason : undefined
    );
    return data
      ? res.json({ success: true, data })
      : res.status(404).json({ success: false, message: 'Identidad no encontrada' });
  } catch (error) {
    next(error);
  }
});

export default router;
