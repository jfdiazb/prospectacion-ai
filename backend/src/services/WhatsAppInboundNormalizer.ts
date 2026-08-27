export type WhatsAppLaunchAction = {
  action: 'registration' | 'confirmation' | 'interaction';
  launchId: string;
  participantToken: string;
  controlId: string;
};
export type NormalizedWhatsAppInbound = {
  externalEventId: string;
  waId: string;
  phoneNumberId: string;
  displayPhoneNumber?: string;
  occurredAt: Date;
  messageType: 'text' | 'button_reply' | 'list_reply' | 'media';
  text: string;
  action?: WhatsAppLaunchAction;
  contextMessageId?: string;
  media?: { type: string; id?: string; mimeType?: string; sha256?: string };
};

const actionPattern =
  /^alma-launch:v1:(registration|confirmation|interaction):([a-f\d]{24}):([A-Za-z0-9_-]{16,160})$/;
export class WhatsAppInboundNormalizer {
  static normalize(message: any, metadata: any): NormalizedWhatsAppInbound | null {
    const externalEventId = String(message?.id || '').trim();
    const waId = String(message?.from || '').replace(/\D/g, '');
    const phoneNumberId = String(metadata?.phone_number_id || '').trim();
    const occurredAt = new Date(Number(message?.timestamp) * 1000);
    if (!externalEventId || !waId || !phoneNumberId || Number.isNaN(occurredAt.getTime()))
      return null;
    const interactive = message?.interactive;
    const reply = interactive?.button_reply || interactive?.list_reply;
    let messageType: NormalizedWhatsAppInbound['messageType'];
    let text: string;
    let action: WhatsAppLaunchAction | undefined;
    let media: NormalizedWhatsAppInbound['media'];
    if (message?.type === 'text' && message?.text?.body?.trim()) {
      messageType = 'text';
      text = message.text.body.trim();
    } else if (reply?.id && reply?.title) {
      messageType = interactive?.type === 'list_reply' ? 'list_reply' : 'button_reply';
      text = String(reply.title).trim().slice(0, 1000);
      const match = String(reply.id).match(actionPattern);
      if (match)
        action = {
          action: match[1] as WhatsAppLaunchAction['action'],
          launchId: match[2],
          participantToken: match[3],
          controlId: String(reply.id),
        };
    } else if (['image', 'audio', 'video', 'document'].includes(message?.type)) {
      const item = message[message.type] || {};
      messageType = 'media';
      text = String(item.caption || `[${message.type}]`)
        .trim()
        .slice(0, 1000);
      media = {
        type: message.type,
        id: item.id ? String(item.id) : undefined,
        mimeType: item.mime_type ? String(item.mime_type).slice(0, 120) : undefined,
        sha256: item.sha256 ? String(item.sha256).slice(0, 200) : undefined,
      };
    } else return null;
    return {
      externalEventId,
      waId,
      phoneNumberId,
      displayPhoneNumber: metadata?.display_phone_number
        ? String(metadata.display_phone_number)
        : undefined,
      occurredAt,
      messageType,
      text,
      action,
      contextMessageId: message?.context?.id ? String(message.context.id) : undefined,
      media,
    };
  }
}
