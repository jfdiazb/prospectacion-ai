import type { TikTokOfficialEvent } from '../integrations/tiktok';

export class TikTokLaunchFixtures {
  static comment(
    eventId: string,
    contentId = 'tiktok-video-1',
    text = 'Comentario TikTok de prueba',
    senderId = 'tiktok-user-1',
    accountId = 'tiktok-account-1'
  ): TikTokOfficialEvent {
    return {
      eventId,
      eventType: 'comment',
      senderId,
      text,
      occurredAt: new Date().toISOString(),
      videoId: contentId,
      commentId: `comment-${eventId}`,
      accountId,
      publicUrl: `https://www.tiktok.com/@fixture/video/${contentId}`,
      senderDisplayName: 'Persona TikTok ficticia',
    };
  }

  static associated(id = 'associated') {
    return this.comment(id);
  }
  static unassociated(id = 'unassociated') {
    return this.comment(id, 'tiktok-video-unassociated');
  }
  static nonParticipant(id = 'non-participant') {
    return this.comment(id, 'tiktok-video-1', 'Lead no participante', 'tiktok-outsider');
  }
  static ambiguous(id = 'ambiguous') {
    return this.comment(id, 'tiktok-video-1', 'Evento sin cuenta', 'tiktok-user-1', '');
  }
  static optOut(id = 'optout') {
    return this.comment(id, 'tiktok-video-1', 'No quiero continuar');
  }
  static directMessage(id = 'dm-without-official-capability'): TikTokOfficialEvent {
    return {
      eventId: id,
      eventType: 'direct_message',
      senderId: 'tiktok-user-1',
      text: 'Mensaje no soportado por L6F',
      occurredAt: new Date().toISOString(),
      conversationId: 'fixture-conversation-only',
    };
  }
}
