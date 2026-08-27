import { Router } from 'express';
import { authMiddleware, type AuthRequest } from '../middlewares/auth';
import { apiLimiter } from '../middlewares/rateLimiter';
import { LaunchSegmentationService } from '../services/LaunchSegmentationService';
import { LaunchDomainError } from '../services/LaunchDomainError';
import { LaunchOperationsService } from '../services/LaunchOperationsService';
import { LaunchLifecycleService } from '../services/LaunchLifecycleService';
import { LaunchCrmService } from '../services/LaunchCrmService';
import { LaunchMetaContentService } from '../services/LaunchMetaContentService';
import { LaunchYouTubeVideoService } from '../services/LaunchYouTubeVideoService';
import { LaunchTikTokContentService } from '../services/LaunchTikTokContentService';

const router = Router();
router.use(authMiddleware, apiLimiter);
const fail = (res: any, error: unknown) => {
  const domain = error instanceof LaunchDomainError;
  return res
    .status(
      domain &&
        ['LAUNCH_NOT_FOUND', 'SEGMENT_NOT_FOUND', 'SEGMENT_VERSION_NOT_FOUND'].includes(error.code)
        ? 404
        : domain && ['CONCURRENT_SEGMENT_UPDATE', 'CONCURRENT_TRANSITION'].includes(error.code)
          ? 409
          : 400
    )
    .json({
      success: false,
      message: error instanceof Error ? error.message : 'Solicitud de lanzamiento inválida',
      code: domain ? error.code : undefined,
    });
};
router.get('/', async (req: AuthRequest, res) => {
  try {
    return res.json({ success: true, data: await LaunchCrmService.list(req.userId!, req.query) });
  } catch (error) {
    return fail(res, error);
  }
});
router.post('/', async (req: AuthRequest, res) => {
  try {
    return res.status(201).json({
      success: true,
      data: await LaunchLifecycleService.createLaunch(req.userId!, {
        ...req.body,
        actor: req.userId!,
        startsAt: req.body.startsAt && new Date(req.body.startsAt),
        eventStartsAt: req.body.eventStartsAt && new Date(req.body.eventStartsAt),
        eventEndsAt: req.body.eventEndsAt && new Date(req.body.eventEndsAt),
        closesAt: req.body.closesAt && new Date(req.body.closesAt),
      }),
    });
  } catch (error) {
    return fail(res, error);
  }
});
router.get('/:launchId', async (req: AuthRequest, res) => {
  try {
    return res.json({
      success: true,
      data: await LaunchCrmService.detail(req.userId!, req.params.launchId),
    });
  } catch (error) {
    return fail(res, error);
  }
});
router.patch('/:launchId', async (req: AuthRequest, res) => {
  try {
    return res.json({
      success: true,
      data: await LaunchLifecycleService.updateLaunch(req.userId!, req.params.launchId, {
        ...req.body,
        actor: req.userId!,
      }),
    });
  } catch (error) {
    return fail(res, error);
  }
});
router.post('/:launchId/transition', async (req: AuthRequest, res) => {
  try {
    return res.json({
      success: true,
      data: await LaunchLifecycleService.transitionLaunch(
        req.userId!,
        req.params.launchId,
        req.body.status,
        req.body.idempotencyKey,
        req.userId!,
        req.body.reason
      ),
    });
  } catch (error) {
    return fail(res, error);
  }
});
router.get('/:launchId/participants', async (req: AuthRequest, res) => {
  try {
    return res.json({
      success: true,
      data: await LaunchCrmService.participants(req.userId!, req.params.launchId),
    });
  } catch (error) {
    return fail(res, error);
  }
});
router.get('/:launchId/actions', async (req: AuthRequest, res) => {
  try {
    return res.json({
      success: true,
      data: await LaunchCrmService.actions(
        req.userId!,
        req.params.launchId,
        String(req.query.status || '')
      ),
    });
  } catch (error) {
    return fail(res, error);
  }
});
router.get('/:launchId/meta-content', async (req: AuthRequest, res) => {
  try {
    return res.json({
      success: true,
      data: await LaunchMetaContentService.list(req.userId!, req.params.launchId),
    });
  } catch (error) {
    return fail(res, error);
  }
});
router.post('/:launchId/meta-content', async (req: AuthRequest, res) => {
  try {
    return res.status(201).json({
      success: true,
      data: await LaunchMetaContentService.link(req.userId!, req.params.launchId, {
        platform: req.body.platform,
        accountId: req.body.accountId,
        contentId: req.body.contentId,
        contentType: req.body.contentType,
        sourceCode: req.body.sourceCode,
        actor: req.userId!,
      }),
    });
  } catch (error) {
    return fail(res, error);
  }
});
router.delete('/:launchId/meta-content/:mappingId', async (req: AuthRequest, res) => {
  try {
    return res.json({
      success: true,
      data: await LaunchMetaContentService.deactivate(
        req.userId!,
        req.params.launchId,
        req.params.mappingId
      ),
    });
  } catch (error) {
    return fail(res, error);
  }
});
router.get('/:launchId/youtube-videos', async (req: AuthRequest, res) => {
  try {
    return res.json({
      success: true,
      data: await LaunchYouTubeVideoService.list(req.userId!, req.params.launchId),
    });
  } catch (error) {
    return fail(res, error);
  }
});
router.post('/:launchId/youtube-videos', async (req: AuthRequest, res) => {
  try {
    return res.status(201).json({
      success: true,
      data: await LaunchYouTubeVideoService.link(req.userId!, req.params.launchId, {
        channelId: req.body.channelId,
        videoId: req.body.videoId,
        publishedAt: req.body.publishedAt && new Date(req.body.publishedAt),
        sourceCode: req.body.sourceCode,
        title: req.body.title,
        actor: req.userId!,
      }),
    });
  } catch (error) {
    return fail(res, error);
  }
});
router.delete('/:launchId/youtube-videos/:mappingId', async (req: AuthRequest, res) => {
  try {
    return res.json({
      success: true,
      data: await LaunchYouTubeVideoService.deactivate(
        req.userId!,
        req.params.launchId,
        req.params.mappingId
      ),
    });
  } catch (error) {
    return fail(res, error);
  }
});
router.get('/:launchId/tiktok-content', async (req: AuthRequest, res) => {
  try {
    return res.json({
      success: true,
      data: await LaunchTikTokContentService.list(req.userId!, req.params.launchId),
    });
  } catch (error) {
    return fail(res, error);
  }
});
router.post('/:launchId/tiktok-content', async (req: AuthRequest, res) => {
  try {
    return res.status(201).json({
      success: true,
      data: await LaunchTikTokContentService.link(req.userId!, req.params.launchId, {
        accountId: req.body.accountId,
        contentId: req.body.contentId,
        publishedAt: req.body.publishedAt && new Date(req.body.publishedAt),
        sourceCode: req.body.sourceCode,
        title: req.body.title,
        actor: req.userId!,
      }),
    });
  } catch (error) {
    return fail(res, error);
  }
});
router.delete('/:launchId/tiktok-content/:mappingId', async (req: AuthRequest, res) => {
  try {
    return res.json({
      success: true,
      data: await LaunchTikTokContentService.deactivate(
        req.userId!,
        req.params.launchId,
        req.params.mappingId
      ),
    });
  } catch (error) {
    return fail(res, error);
  }
});
router.post('/segments/validate', async (req: AuthRequest, res) => {
  try {
    return res.json({ success: true, data: LaunchSegmentationService.validate(req.body) });
  } catch (error) {
    return fail(res, error);
  }
});
router.put('/:launchId/segment', async (req: AuthRequest, res) => {
  try {
    return res.json({
      success: true,
      data: await LaunchSegmentationService.save(
        req.userId!,
        req.params.launchId,
        req.body.definition,
        req.userId!,
        req.body.reason
      ),
    });
  } catch (error) {
    return fail(res, error);
  }
});
router.post('/:launchId/segment/preview', async (req: AuthRequest, res) => {
  try {
    return res.json({
      success: true,
      data: await LaunchSegmentationService.preview(req.userId!, req.params.launchId, {
        page: req.body.page,
        limit: req.body.limit,
        version: req.body.version,
        actor: req.userId!,
        idempotencyKey: req.body.idempotencyKey,
      }),
    });
  } catch (error) {
    return fail(res, error);
  }
});
router.post('/:launchId/participants/select', async (req: AuthRequest, res) => {
  try {
    return res.status(201).json({
      success: true,
      data: await LaunchSegmentationService.confirmSelection(req.userId!, req.params.launchId, {
        segmentVersion: req.body.segmentVersion,
        decisions: req.body.decisions,
        idempotencyKey: req.body.idempotencyKey,
        actor: req.userId!,
      }),
    });
  } catch (error) {
    return fail(res, error);
  }
});
router.post('/:launchId/participants/manual', async (req: AuthRequest, res) => {
  try {
    return res.status(201).json({
      success: true,
      data: await LaunchSegmentationService.addManual(req.userId!, req.params.launchId, {
        leadId: req.body.leadId,
        conversationId: req.body.conversationId,
        reason: req.body.reason,
        idempotencyKey: req.body.idempotencyKey,
        actor: req.userId!,
      }),
    });
  } catch (error) {
    return fail(res, error);
  }
});
router.get('/:launchId/participants/:participantId/operations', async (req: AuthRequest, res) => {
  try {
    return res.json({
      success: true,
      data: await LaunchOperationsService.status(
        req.userId!,
        req.params.launchId,
        req.params.participantId
      ),
    });
  } catch (error) {
    return fail(res, error);
  }
});
router.post('/:launchId/participants/:participantId/register', async (req: AuthRequest, res) => {
  try {
    return res.json({
      success: true,
      data: await LaunchOperationsService.register(
        req.userId!,
        req.params.launchId,
        req.params.participantId,
        req.body.evidence,
        req.body.idempotencyKey,
        req.userId!
      ),
    });
  } catch (error) {
    return fail(res, error);
  }
});
router.post('/:launchId/participants/:participantId/confirm', async (req: AuthRequest, res) => {
  try {
    return res.json({
      success: true,
      data: await LaunchOperationsService.confirm(
        req.userId!,
        req.params.launchId,
        req.params.participantId,
        req.body.evidence,
        req.body.idempotencyKey,
        req.userId!
      ),
    });
  } catch (error) {
    return fail(res, error);
  }
});
router.post('/:launchId/participants/:participantId/attendance', async (req: AuthRequest, res) => {
  try {
    return res.json({
      success: true,
      data: await LaunchOperationsService.attendance(
        req.userId!,
        req.params.launchId,
        req.params.participantId,
        req.body.status,
        req.body.evidence,
        req.body.idempotencyKey,
        req.userId!,
        req.body.reason
      ),
    });
  } catch (error) {
    return fail(res, error);
  }
});
router.post('/:launchId/participants/:participantId/correct', async (req: AuthRequest, res) => {
  try {
    return res.json({
      success: true,
      data: await LaunchOperationsService.correct(
        req.userId!,
        req.params.launchId,
        req.params.participantId,
        req.body.dimension,
        req.body.evidence,
        req.body.idempotencyKey,
        req.userId!,
        req.body.reason
      ),
    });
  } catch (error) {
    return fail(res, error);
  }
});
router.post('/:launchId/participants/:participantId/meeting', async (req: AuthRequest, res) => {
  try {
    return res.json({
      success: true,
      data: await LaunchOperationsService.attachMeeting(
        req.userId!,
        req.params.launchId,
        req.params.participantId,
        req.body.meetingId,
        req.userId!,
        req.body.idempotencyKey
      ),
    });
  } catch (error) {
    return fail(res, error);
  }
});
router.get('/:launchId/operational-metrics', async (req: AuthRequest, res) => {
  try {
    return res.json({
      success: true,
      data: await LaunchOperationsService.metrics(req.userId!, req.params.launchId),
    });
  } catch (error) {
    return fail(res, error);
  }
});
router.post('/:launchId/operations/import', async (req: AuthRequest, res) => {
  try {
    return res.json({
      success: true,
      data: await LaunchOperationsService.importBatch(
        req.userId!,
        req.params.launchId,
        req.body.items,
        req.userId!
      ),
    });
  } catch (error) {
    return fail(res, error);
  }
});
export default router;
