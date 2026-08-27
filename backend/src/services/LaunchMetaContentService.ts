import Launch from '../models/Launch';
import LaunchMetaContent from '../models/LaunchMetaContent';
import { LaunchDomainError } from './LaunchDomainError';

export class LaunchMetaContentService {
  static async link(
    userId: string,
    launchId: string,
    input: {
      platform: 'instagram' | 'facebook';
      accountId: string;
      contentId: string;
      contentType?: 'post' | 'reel' | 'video' | 'ad_creative' | 'other';
      sourceCode?: string;
      actor: string;
    }
  ) {
    const accountId = String(input.accountId || '').trim();
    const contentId = String(input.contentId || '').trim();
    if (
      !['instagram', 'facebook'].includes(input.platform) ||
      !accountId ||
      accountId.length > 200 ||
      !contentId ||
      contentId.length > 300
    )
      throw new LaunchDomainError('Contenido Meta inválido', 'INVALID_META_CONTENT');
    const launch: any = await Launch.findOne({ _id: launchId, userId });
    if (!launch) throw new LaunchDomainError('Lanzamiento no encontrado', 'LAUNCH_NOT_FOUND');
    if (['completed', 'cancelled'].includes(launch.status))
      throw new LaunchDomainError('El lanzamiento está en estado terminal', 'LAUNCH_TERMINAL');
    const mappingKey = `${input.platform}:${accountId}:${contentId}`;
    const existing: any = await LaunchMetaContent.findOne({
      userId,
      platform: input.platform,
      accountId,
      contentId,
    });
    if (existing && existing.launchId.toString() !== launchId)
      throw new LaunchDomainError(
        'El contenido Meta ya pertenece a otro lanzamiento',
        'META_CONTENT_CONFLICT'
      );
    const mapping: any = await LaunchMetaContent.findOneAndUpdate(
      { userId, platform: input.platform, accountId, contentId },
      {
        $setOnInsert: {
          userId,
          launchId,
          platform: input.platform,
          accountId,
          contentId,
          mappingKey,
          createdBy: input.actor,
        },
        $set: {
          status: 'active',
          deactivatedAt: null,
          metadata: { contentType: input.contentType || 'other', sourceCode: input.sourceCode },
        },
      },
      { new: true, upsert: true, runValidators: true }
    );
    if (mapping.launchId.toString() !== launchId)
      throw new LaunchDomainError(
        'El contenido Meta ya pertenece a otro lanzamiento',
        'META_CONTENT_CONFLICT'
      );
    return mapping;
  }

  static list(userId: string, launchId: string) {
    return LaunchMetaContent.find({ userId, launchId }).sort({ createdAt: 1 });
  }

  static async deactivate(userId: string, launchId: string, mappingId: string) {
    const mapping = await LaunchMetaContent.findOneAndUpdate(
      { _id: mappingId, userId, launchId },
      { $set: { status: 'inactive', deactivatedAt: new Date() } },
      { new: true }
    );
    if (!mapping)
      throw new LaunchDomainError('Contenido Meta no encontrado', 'META_CONTENT_NOT_FOUND');
    return mapping;
  }
}
