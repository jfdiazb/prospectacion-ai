import type { MessagingRecipient } from '../messaging';
import {
  IntentNormalizationService,
  type CommercialContextLike,
} from '../../services/IntentNormalizationService';
import { AMWAY_INITIAL_CONTEXT } from '../../commercial/presets/amway';

export type MetaPlatform = 'instagram' | 'facebook';
export interface NormalizedMetaEvent {
  platform: MetaPlatform;
  externalEventId: string;
  externalUserId: string;
  eventType: 'comment' | 'direct_message';
  content: string;
  occurredAt: Date;
  source: string;
  externalContentId?: string;
  messageId?: string;
  commentId?: string;
  parentId?: string;
  recipientId?: string;
  accountId?: string;
  publicUrl?: string;
  privateReplyCommentId?: string;
  launchParticipantToken?: string;
  recipient: MessagingRecipient;
  rawPayload: Record<string, unknown>;
}

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export class MetaWebhookNormalizer {
  static interestPhrases(context?: CommercialContextLike | null): string[] {
    const configured = (process.env.META_INITIAL_INTENT_PHRASES || '')
      .split(',')
      .map(normalize)
      .filter(Boolean);
    const contextual =
      context?.intentTerms
        ?.flatMap(group => group.phrases ?? [])
        .map(normalize)
        .filter(Boolean) ?? [];
    const bootstrap = context
      ? []
      : [
          ...AMWAY_INITIAL_CONTEXT.intentTerms.flatMap(group => group.phrases),
          AMWAY_INITIAL_CONTEXT.brandName,
          ...AMWAY_INITIAL_CONTEXT.productFamilies,
        ].map(normalize);
    return [
      ...new Set([
        ...configured,
        ...contextual,
        ...bootstrap,
        'info',
        'informacion',
        'quiero informacion',
        'mas informacion',
        'me interesa',
        'quiero saber mas',
        'como funciona',
        'como puedo empezar',
      ]),
    ];
  }

  static matchesInitialIntent(text: string, context?: CommercialContextLike | null): boolean {
    const haystack = ` ${normalize(text)} `;
    return (
      this.interestPhrases(context).some(phrase => haystack.includes(` ${phrase} `)) ||
      IntentNormalizationService.analyze([text], context).intent !== 'undetermined'
    );
  }

  static normalizePayload(payload: any): NormalizedMetaEvent[] {
    const events: NormalizedMetaEvent[] = [];
    const objectPlatform: MetaPlatform = payload?.object === 'page' ? 'facebook' : 'instagram';
    for (const entry of payload?.entry ?? []) {
      for (const item of entry.messaging ?? []) {
        const text = item?.message?.text;
        const eventId = item?.message?.mid;
        const senderId = item?.sender?.id;
        if (!text || !eventId || !senderId || item.message?.is_echo) continue;
        const platform = objectPlatform;
        const recipientId = item?.recipient?.id ?? entry?.id;
        const privateReplyCommentId = item?.message?.reply_to?.mid ?? item?.referral?.comment_id;
        const launchParticipantToken = String(item?.referral?.ref || '').startsWith('alma-launch:')
          ? String(item.referral.ref).slice('alma-launch:'.length)
          : undefined;
        events.push({
          platform,
          externalEventId: `meta:${platform}:${String(eventId)}`,
          externalUserId: String(senderId),
          eventType: 'direct_message',
          content: String(text).trim(),
          occurredAt: new Date(Number(item.timestamp) || Date.now()),
          source: `${platform}_direct_message`,
          messageId: String(eventId),
          recipientId: recipientId != null ? String(recipientId) : undefined,
          accountId: entry?.id != null ? String(entry.id) : undefined,
          privateReplyCommentId:
            privateReplyCommentId != null ? String(privateReplyCommentId) : undefined,
          launchParticipantToken,
          recipient:
            platform === 'facebook'
              ? { type: 'facebook_user', pageScopedId: String(senderId) }
              : { type: 'instagram_user', instagramScopedId: String(senderId) },
          rawPayload: {
            messageId: String(eventId),
            senderId: String(senderId),
            recipientId: recipientId != null ? String(recipientId) : undefined,
            privateReplyCommentId:
              privateReplyCommentId != null ? String(privateReplyCommentId) : undefined,
            timestamp: item.timestamp,
          },
        });
      }
      for (const change of entry.changes ?? []) {
        const value = change?.value ?? {};
        const platform: MetaPlatform =
          value.platform === 'facebook' || payload?.object === 'page' ? 'facebook' : 'instagram';
        const text = value.text ?? value.message?.text;
        const senderId = value.from?.id ?? value.sender?.id;
        const eventId = value.id ?? value.comment_id ?? value.message?.mid;
        if (!text || !senderId || !eventId) continue;
        const isComment =
          change.field === 'comments' ||
          Boolean(value.comment_id) ||
          Boolean(value.media?.id && !value.message);
        const eventType = isComment ? 'comment' : 'direct_message';
        const recipient: MessagingRecipient = isComment
          ? platform === 'facebook'
            ? { type: 'facebook_comment', commentId: String(value.comment_id ?? value.id) }
            : { type: 'instagram_comment', commentId: String(value.comment_id ?? value.id) }
          : platform === 'facebook'
            ? { type: 'facebook_user', pageScopedId: String(senderId) }
            : { type: 'instagram_user', instagramScopedId: String(senderId) };
        const commentId = isComment ? String(value.comment_id ?? value.id) : undefined;
        const messageId = !isComment ? String(value.message?.mid ?? value.id) : undefined;
        const parentId = value.parent_id ?? value.parent?.id;
        const recipientId = value.recipient?.id ?? entry?.id;
        events.push({
          platform,
          externalEventId: `meta:${platform}:${String(eventId)}`,
          externalUserId: String(senderId),
          eventType,
          content: String(text).trim(),
          occurredAt: new Date(
            Number(value.created_time || value.timestamp) *
              (Number(value.created_time || value.timestamp) < 1e12 ? 1000 : 1) || Date.now()
          ),
          source: isComment
            ? `${platform}_${platform === 'instagram' ? 'reel_or_post' : 'post'}_comment`
            : `${platform}_direct_message`,
          externalContentId: value.media?.id ?? value.post_id,
          messageId,
          commentId,
          parentId: parentId != null ? String(parentId) : undefined,
          recipientId: recipientId != null ? String(recipientId) : undefined,
          accountId: entry?.id != null ? String(entry.id) : undefined,
          publicUrl: value.permalink_url,
          recipient,
          rawPayload: {
            messageId,
            commentId,
            parentId: parentId != null ? String(parentId) : undefined,
            senderId: String(senderId),
            recipientId: recipientId != null ? String(recipientId) : undefined,
            contentId: value.media?.id ?? value.post_id,
            timestamp: value.created_time ?? value.timestamp,
          },
        });
      }
    }
    const unique = new Map(
      events.map(event => [`${event.platform}:${event.externalEventId}`, event])
    );
    return [...unique.values()];
  }
}
