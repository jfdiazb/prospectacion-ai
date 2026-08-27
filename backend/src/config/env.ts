import dotenv from 'dotenv';
import path from 'path';
import User from '../models/User';

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../.env'), override: false });

export const validateServerEnvironment = (): void => {
  const required = ['MONGO_URI', 'JWT_SECRET'];
  if (process.env.NODE_ENV === 'production') required.push('CORS_ORIGIN');
  const missing = required.filter(key => !process.env[key]?.trim());
  if (missing.length) throw new Error(`Faltan variables obligatorias: ${missing.join(', ')}`);
  if (process.env.NODE_ENV === 'production' && (process.env.JWT_SECRET?.length ?? 0) < 32) {
    throw new Error('JWT_SECRET debe tener al menos 32 caracteres en producción');
  }
  const aiMode = process.env.AI_MODE;
  if (aiMode && !['mock', 'live'].includes(aiMode)) throw new Error('AI_MODE debe ser mock o live');
  if (aiMode === 'live' && !process.env.GEMINI_API_KEY?.trim())
    throw new Error('GEMINI_API_KEY es obligatoria cuando AI_MODE=live');
  const ownerId = process.env.CRM_OWNER_ID?.trim();
  if (ownerId && !/^[0-9a-fA-F]{24}$/.test(ownerId))
    throw new Error(
      'CRM_OWNER_ID debe contener exactamente 24 caracteres hexadecimales, sin < > ni comillas'
    );
  const formWebhookSecret = process.env.LAUNCH_FORM_WEBHOOK_SECRET?.trim();
  const formWebhookOwner = process.env.LAUNCH_FORM_WEBHOOK_OWNER_ID?.trim();
  if (formWebhookSecret || formWebhookOwner) {
    if ((formWebhookSecret?.length ?? 0) < 32)
      throw new Error('LAUNCH_FORM_WEBHOOK_SECRET debe tener al menos 32 caracteres');
    if (!formWebhookOwner || !/^[0-9a-fA-F]{24}$/.test(formWebhookOwner))
      throw new Error('LAUNCH_FORM_WEBHOOK_OWNER_ID debe ser un ObjectId válido');
    const tolerance = Number(process.env.LAUNCH_FORM_WEBHOOK_TOLERANCE_MS || 300000);
    if (!Number.isFinite(tolerance) || tolerance < 30000 || tolerance > 900000)
      throw new Error('LAUNCH_FORM_WEBHOOK_TOLERANCE_MS debe estar entre 30000 y 900000');
    const payloadLimit = Number(process.env.LAUNCH_FORM_WEBHOOK_MAX_PAYLOAD_BYTES || 65536);
    if (!Number.isFinite(payloadLimit) || payloadLimit < 1024 || payloadLimit > 262144)
      throw new Error('LAUNCH_FORM_WEBHOOK_MAX_PAYLOAD_BYTES debe estar entre 1024 y 262144');
  }
  const youtubeMode = process.env.YOUTUBE_MESSAGING_MODE || 'mock';
  if (!['mock', 'live'].includes(youtubeMode))
    throw new Error('YOUTUBE_MESSAGING_MODE debe ser mock o live');
  const youtubeIngestionMode = process.env.YOUTUBE_INGESTION_MODE || 'mock';
  if (!['mock', 'live'].includes(youtubeIngestionMode))
    throw new Error('YOUTUBE_INGESTION_MODE debe ser mock o live');
  if (youtubeMode === 'live' || youtubeIngestionMode === 'live') {
    const youtubeMissing = [
      'YOUTUBE_CLIENT_ID',
      'YOUTUBE_CLIENT_SECRET',
      'YOUTUBE_OAUTH_REDIRECT_URI',
      'YOUTUBE_OAUTH_STATE_SECRET',
      'YOUTUBE_TOKEN_ENCRYPTION_KEY',
      'CRM_OWNER_ID',
    ].filter(key => !process.env[key]?.trim());
    if (youtubeMissing.length)
      throw new Error(`Faltan variables para YouTube live: ${youtubeMissing.join(', ')}`);
    if ((process.env.YOUTUBE_OAUTH_STATE_SECRET?.length ?? 0) < 32)
      throw new Error('YOUTUBE_OAUTH_STATE_SECRET debe tener al menos 32 caracteres');
    const encryptionKey = process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY!.trim();
    const decodedKey = /^[a-f\d]{64}$/i.test(encryptionKey)
      ? Buffer.from(encryptionKey, 'hex')
      : Buffer.from(encryptionKey, 'base64');
    if (decodedKey.length !== 32)
      throw new Error('YOUTUBE_TOKEN_ENCRYPTION_KEY debe representar exactamente 32 bytes');
  }
  const messagingMode =
    process.env.INSTAGRAM_MESSAGING_MODE || process.env.META_MESSAGING_MODE || 'mock';
  for (const key of ['META_INBOUND_MAX_AGE_MS', 'META_LAUNCH_EVENT_TOLERANCE_MS']) {
    const value = Number(process.env[key] || 600000);
    if (!Number.isFinite(value) || value < 60000 || value > 3600000)
      throw new Error(`${key} debe estar entre 60000 y 3600000`);
  }
  if (!['mock', 'live'].includes(messagingMode))
    throw new Error('META_MESSAGING_MODE debe ser mock o live');
  if (messagingMode === 'live') {
    const metaMissing = ['META_ACCESS_TOKEN', 'META_IG_USER_ID'].filter(
      key => !process.env[key]?.trim()
    );
    if (metaMissing.length)
      throw new Error(`Faltan variables para mensajería Meta live: ${metaMissing.join(', ')}`);
  }
  const facebookMessagingMode =
    process.env.FACEBOOK_MESSAGING_MODE || process.env.META_MESSAGING_MODE || 'mock';
  if (!['mock', 'live'].includes(facebookMessagingMode))
    throw new Error('FACEBOOK_MESSAGING_MODE debe ser mock o live');
  if (facebookMessagingMode === 'live') {
    const facebookMissing = ['META_PAGE_ACCESS_TOKEN', 'META_PAGE_ID'].filter(
      key => !process.env[key]?.trim()
    );
    if (facebookMissing.length)
      throw new Error(`Faltan variables para Facebook live: ${facebookMissing.join(', ')}`);
  }
  const whatsappMessagingMode = process.env.WHATSAPP_MESSAGING_MODE || 'mock';
  if (!['mock', 'live'].includes(whatsappMessagingMode))
    throw new Error('WHATSAPP_MESSAGING_MODE debe ser mock o live');
  const whatsappReplyMode = process.env.WHATSAPP_REPLY_MODE || 'assisted';
  if (!['assisted', 'automatic'].includes(whatsappReplyMode))
    throw new Error('WHATSAPP_REPLY_MODE debe ser assisted o automatic');
  const whatsappInboundMaxAgeMs = Number(process.env.WHATSAPP_INBOUND_MAX_AGE_MS || 600000);
  if (!Number.isFinite(whatsappInboundMaxAgeMs) || whatsappInboundMaxAgeMs < 60000)
    throw new Error('WHATSAPP_INBOUND_MAX_AGE_MS debe ser un número de al menos 60000');
  if (process.env.WHATSAPP_AUTO_REPLY_ENABLED === 'true' && whatsappMessagingMode === 'live') {
    const whatsappMissing = [
      'WHATSAPP_TOKEN',
      'WHATSAPP_PHONE_NUMBER_ID',
      'WHATSAPP_APP_SECRET',
    ].filter(key => !process.env[key]?.trim());
    if (whatsappMissing.length)
      throw new Error(`Faltan variables para WhatsApp live: ${whatsappMissing.join(', ')}`);
  }
  const zoomMode = process.env.ZOOM_MODE || 'mock';
  if (!['mock', 'live'].includes(zoomMode)) throw new Error('ZOOM_MODE debe ser mock o live');
  if (zoomMode === 'live') {
    const zoomMissing = [
      'ZOOM_CLIENT_ID',
      'ZOOM_CLIENT_SECRET',
      'ZOOM_ACCOUNT_ID',
      'ZOOM_USER_ID',
    ].filter(key => !process.env[key]?.trim());
    if (zoomMissing.length)
      throw new Error(`Faltan variables para Zoom live: ${zoomMissing.join(', ')}`);
  }
  const schedulingMode = process.env.SCHEDULING_MODE || 'zoom';
  if (!['zoom', 'calendly'].includes(schedulingMode))
    throw new Error('SCHEDULING_MODE debe ser zoom o calendly');
  if (schedulingMode === 'calendly') {
    const bookingUrl = process.env.CALENDLY_BOOKING_URL?.trim();
    if (!bookingUrl)
      throw new Error('CALENDLY_BOOKING_URL es obligatoria cuando SCHEDULING_MODE=calendly');
    try {
      if (new URL(bookingUrl).protocol !== 'https:') throw new Error();
    } catch {
      throw new Error('CALENDLY_BOOKING_URL debe ser una URL HTTPS válida');
    }
    const webhookSecret = process.env.CALENDLY_WEBHOOK_SECRET?.trim();
    if (webhookSecret && webhookSecret.length < 32)
      throw new Error('CALENDLY_WEBHOOK_SECRET debe tener al menos 32 caracteres');
    if (!process.env.CALENDLY_PERSONAL_ACCESS_TOKEN?.trim())
      throw new Error(
        'CALENDLY_PERSONAL_ACCESS_TOKEN es obligatorio cuando SCHEDULING_MODE=calendly'
      );
    const pollInterval = Number(process.env.CALENDLY_POLL_INTERVAL_MS || 120000);
    if (!Number.isFinite(pollInterval) || pollInterval < 60000)
      throw new Error('CALENDLY_POLL_INTERVAL_MS debe ser un número de al menos 60000');
  }
};

export const validateDatabaseEnvironment = async (): Promise<void> => {
  const ownerId = process.env.CRM_OWNER_ID?.trim();
  if (ownerId) {
    const exists = await User.exists({ _id: ownerId });
    if (!exists) throw new Error('CRM_OWNER_ID no corresponde a un usuario existente en MongoDB');
  }
  const formOwnerId = process.env.LAUNCH_FORM_WEBHOOK_OWNER_ID?.trim();
  if (formOwnerId && !(await User.exists({ _id: formOwnerId })))
    throw new Error(
      'LAUNCH_FORM_WEBHOOK_OWNER_ID no corresponde a un usuario existente en MongoDB'
    );
};
