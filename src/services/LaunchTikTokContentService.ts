import Launch from '../models/Launch';
import LaunchTikTokContent from '../models/LaunchTikTokContent';
import { LaunchDomainError } from './LaunchDomainError';

export class LaunchTikTokContentService {
  static async link(
    userId: string,
    launchId: string,
    input: {
      accountId: string;
      contentId: string;
      publishedAt?: Date;
      sourceCode?: string;
      title?: string;
      actor: string;
    }
  ) {
    const accountId = String(input.accountId || '').trim();
    const contentId = String(input.contentId || '').trim();
    if (!accountId || accountId.length > 200 || !contentId || contentId.length > 300)
      throw new LaunchDomainError('Contenido TikTok inválido', 'INVALID_TIKTOK_CONTENT');
    const launch: any = await Launch.findOne({ _id: launchId, userId });
    if (!launch) throw new LaunchDomainError('Lanzamiento no encontrado', 'LAUNCH_NOT_FOUND');
    if (['completed', 'cancelled'].includes(launch.status))
      throw new LaunchDomainError('El lanzamiento está en estado terminal', 'LAUNCH_TERMINAL');
    const existing: any = await LaunchTikTokContent.findOne({ userId, accountId, contentId });
    if (existing && existing.launchId.toString() !== launchId)
      throw new LaunchDomainError(
        'El contenido TikTok ya pertenece a otro lanzamiento',
        'TIKTOK_CONTENT_CONFLICT'
      );
    const mapping: any = await LaunchTikTokContent.findOneAndUpdate(
      { userId, accountId, contentId },
      {
        $setOnInsert: {
          userId,
          launchId,
          accountId,
          contentId,
          mappingKey: `${accountId}:${contentId}`,
          createdBy: input.actor,
        },
        $set: {
          status: 'active',
          deactivatedAt: null,
          publishedAt: input.publishedAt,
          metadata: { sourceCode: input.sourceCode, title: input.title },
        },
      },
      { upsert: true, new: true, runValidators: true }
    );
    if (mapping.launchId.toString() !== launchId)
      throw new LaunchDomainError(
        'El contenido TikTok ya pertenece a otro lanzamiento',
        'TIKTOK_CONTENT_CONFLICT'
      );
    return mapping;
  }

  static list(userId: string, launchId: string) {
    return LaunchTikTokContent.find({ userId, launchId }).sort({ createdAt: 1 });
  }

  static async deactivate(userId: string, launchId: string, mappingId: string) {
    const mapping = await LaunchTikTokContent.findOneAndUpdate(
      { _id: mappingId, userId, launchId },
      { $set: { status: 'inactive', deactivatedAt: new Date() } },
      { new: true }
    );
    if (!mapping)
      throw new LaunchDomainError('Contenido TikTok no encontrado', 'TIKTOK_CONTENT_NOT_FOUND');
    return mapping;
  }
}
