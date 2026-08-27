import Launch from '../models/Launch';
import LaunchYouTubeVideo from '../models/LaunchYouTubeVideo';
import { LaunchDomainError } from './LaunchDomainError';

export class LaunchYouTubeVideoService {
  static async link(
    userId: string,
    launchId: string,
    input: {
      channelId: string;
      videoId: string;
      publishedAt?: Date;
      sourceCode?: string;
      title?: string;
      actor: string;
    }
  ) {
    const channelId = String(input.channelId || '').trim(),
      videoId = String(input.videoId || '').trim();
    if (!channelId || channelId.length > 200 || !videoId || videoId.length > 200)
      throw new LaunchDomainError('Video YouTube inválido', 'INVALID_YOUTUBE_VIDEO');
    const launch: any = await Launch.findOne({ _id: launchId, userId });
    if (!launch) throw new LaunchDomainError('Lanzamiento no encontrado', 'LAUNCH_NOT_FOUND');
    if (['completed', 'cancelled'].includes(launch.status))
      throw new LaunchDomainError('El lanzamiento está en estado terminal', 'LAUNCH_TERMINAL');
    const existing: any = await LaunchYouTubeVideo.findOne({ userId, channelId, videoId });
    if (existing && existing.launchId.toString() !== launchId)
      throw new LaunchDomainError(
        'El video ya pertenece a otro lanzamiento',
        'YOUTUBE_VIDEO_CONFLICT'
      );
    const mapping: any = await LaunchYouTubeVideo.findOneAndUpdate(
      { userId, channelId, videoId },
      {
        $setOnInsert: {
          userId,
          launchId,
          channelId,
          videoId,
          mappingKey: `${channelId}:${videoId}`,
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
        'El video ya pertenece a otro lanzamiento',
        'YOUTUBE_VIDEO_CONFLICT'
      );
    return mapping;
  }
  static list(userId: string, launchId: string) {
    return LaunchYouTubeVideo.find({ userId, launchId }).sort({ createdAt: 1 });
  }
  static async deactivate(userId: string, launchId: string, mappingId: string) {
    const mapping = await LaunchYouTubeVideo.findOneAndUpdate(
      { _id: mappingId, userId, launchId },
      { $set: { status: 'inactive', deactivatedAt: new Date() } },
      { new: true }
    );
    if (!mapping)
      throw new LaunchDomainError('Video YouTube no encontrado', 'YOUTUBE_VIDEO_NOT_FOUND');
    return mapping;
  }
}
