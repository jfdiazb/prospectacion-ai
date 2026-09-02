import type { AxiosInstance } from 'axios';
import { AxiosError } from 'axios';
import { MetaMessagingProvider } from '../src/integrations/messaging/MetaMessagingProvider';
import { MessagingProviderError } from '../src/integrations/messaging/MessagingProvider';
import { getMessagingProvider } from '../src/integrations/messaging';

describe('production outbound kill switch', () => {
  const originalEnv = process.env;
  afterEach(() => { process.env = originalEnv; });

  test('forces mock in production until real outbound is explicitly enabled', () => {
    process.env = { ...originalEnv, NODE_ENV: 'production', WHATSAPP_MESSAGING_MODE: 'live' };
    expect(getMessagingProvider('whatsapp').name).toBe('mock');
    process.env.REAL_OUTBOUND_ENABLED = 'true';
    expect(getMessagingProvider('whatsapp').name).toBe('meta');
  });

  test('allows only Instagram through its isolated production switch', () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      REAL_OUTBOUND_ENABLED: 'false',
      INSTAGRAM_REAL_OUTBOUND_ENABLED: 'true',
      INSTAGRAM_MESSAGING_MODE: 'live',
      FACEBOOK_MESSAGING_MODE: 'live',
      WHATSAPP_MESSAGING_MODE: 'live',
      YOUTUBE_MESSAGING_MODE: 'live',
      META_AUTO_SEND_ENABLED: 'false',
      WHATSAPP_AUTO_REPLY_ENABLED: 'false',
    };

    expect(getMessagingProvider('instagram').name).toBe('meta');
    expect(getMessagingProvider('facebook').name).toBe('mock');
    expect(getMessagingProvider('whatsapp').name).toBe('mock');
    expect(getMessagingProvider('youtube').name).toBe('mock');
    expect(process.env.META_AUTO_SEND_ENABLED).toBe('false');
    expect(process.env.WHATSAPP_AUTO_REPLY_ENABLED).toBe('false');
  });
});

describe('MetaMessagingProvider', () => {
  const originalEnv = process.env;
  beforeEach(() => {
    process.env = { ...originalEnv, META_ACCESS_TOKEN: 'test-token-never-logged', META_IG_USER_ID: 'ig-business-1', META_GRAPH_API_VERSION: 'v23.0' };
  });
  afterAll(() => { process.env = originalEnv; });

  test('sends an initial private reply with comment_id', async () => {
    const post = jest.fn().mockResolvedValue({ data: { message_id: 'meta-message-1' } });
    const provider = new MetaMessagingProvider({ post } as unknown as AxiosInstance);
    await expect(provider.sendMessage({ text: 'Hola', recipient: { type: 'comment', commentId: 'comment-1' } }))
      .resolves.toEqual({ externalMessageId: 'meta-message-1', simulated: false });
    expect(post).toHaveBeenCalledWith(
      'https://graph.instagram.com/v23.0/me/messages',
      { recipient: { comment_id: 'comment-1' }, message: { text: 'Hola' } },
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer test-token-never-logged' }) }),
    );
  });

  test('maps a Meta authentication failure without exposing credentials', async () => {
    const error = new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, { status: 401, data: { error: { code: 190, message: 'Invalid OAuth access token.' } } } as any);
    const provider = new MetaMessagingProvider({ post: jest.fn().mockRejectedValue(error) } as unknown as AxiosInstance);
    await expect(provider.sendMessage({ text: 'Hola', recipient: { type: 'comment', commentId: 'comment-1' } }))
      .rejects.toMatchObject({ code: '190', status: 401, message: 'Invalid OAuth access token.' });
  });

  test('maps a Meta timeout', async () => {
    const error = new AxiosError('timeout', 'ECONNABORTED');
    const provider = new MetaMessagingProvider({ post: jest.fn().mockRejectedValue(error) } as unknown as AxiosInstance);
    await expect(provider.sendMessage({ text: 'Hola', recipient: { type: 'instagram_user', instagramScopedId: 'igsid-1' } }))
      .rejects.toMatchObject({ code: 'META_TIMEOUT' });
  });

  test('rejects an invalid Meta response', async () => {
    const provider = new MetaMessagingProvider({ post: jest.fn().mockResolvedValue({ data: {} }) } as unknown as AxiosInstance);
    await expect(provider.sendMessage({ text: 'Hola', recipient: { type: 'comment', commentId: 'comment-1' } }))
      .rejects.toBeInstanceOf(MessagingProviderError);
    await expect(provider.sendMessage({ text: 'Hola', recipient: { type: 'comment', commentId: 'comment-1' } }))
      .rejects.toMatchObject({ code: 'META_INVALID_RESPONSE' });
  });

  test('sends WhatsApp through the same official Meta provider', async () => {
    process.env.WHATSAPP_TOKEN = 'whatsapp-test-token';
    process.env.WHATSAPP_PHONE_NUMBER_ID = 'phone-number-id';
    process.env.WHATSAPP_ACTIVATION_ALLOWLIST = '+57 300 123 4567';
    const post = jest.fn().mockResolvedValue({ data: { messages: [{ id: 'wamid.official-1' }] } });
    const provider = new MetaMessagingProvider({ post } as unknown as AxiosInstance);
    await expect(provider.sendMessage({ text: 'Hola desde ALMA', recipient: { type: 'whatsapp_user', phoneNumber: '573001234567' }, whatsappAuthorization: { mode: 'static_allowlist', recipientId: '573001234567' } }))
      .resolves.toEqual({ externalMessageId: 'wamid.official-1', simulated: false });
    expect(post).toHaveBeenCalledWith('https://graph.facebook.com/v23.0/phone-number-id/messages',
      { messaging_product: 'whatsapp', to: '573001234567', type: 'text', text: { body: 'Hola desde ALMA' } },
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer whatsapp-test-token' }) }));
  });

  test('blocks a WhatsApp recipient outside the activation allowlist before calling Meta', async () => {
    process.env.WHATSAPP_TOKEN = 'whatsapp-test-token';
    process.env.WHATSAPP_PHONE_NUMBER_ID = 'phone-number-id';
    process.env.WHATSAPP_ACTIVATION_ALLOWLIST = '573001111111';
    const post = jest.fn();
    const provider = new MetaMessagingProvider({ post } as unknown as AxiosInstance);
    await expect(provider.sendMessage({ text: 'No enviar', recipient: { type: 'whatsapp_user', phoneNumber: '573009999999' } }))
      .rejects.toMatchObject({ code: 'WHATSAPP_RECIPIENT_NOT_ALLOWLISTED' });
    expect(post).not.toHaveBeenCalled();
  });

  test('sends a Facebook Page DM with a PSID and the Page endpoint', async () => {
    process.env.META_PAGE_ACCESS_TOKEN = 'page-token-never-logged';
    process.env.META_PAGE_ID = 'page-1';
    const post = jest.fn().mockResolvedValue({ data: { message_id: 'fb-message-1' } });
    const provider = new MetaMessagingProvider({ post } as unknown as AxiosInstance);
    await expect(provider.sendMessage({ text: 'Hola', recipient: { type: 'facebook_user', pageScopedId: 'psid-1' } })).resolves.toMatchObject({ externalMessageId: 'fb-message-1' });
    expect(post).toHaveBeenCalledWith('https://graph.facebook.com/v23.0/page-1/messages', { recipient: { id: 'psid-1' }, message: { text: 'Hola' } }, expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer page-token-never-logged' }) }));
  });

  test('uses the official Facebook private-replies resource for a Page comment', async () => {
    process.env.META_PAGE_ACCESS_TOKEN = 'page-token-never-logged';
    const post = jest.fn().mockResolvedValue({ data: { id: 'private-reply-1' } });
    const provider = new MetaMessagingProvider({ post } as unknown as AxiosInstance);
    await provider.sendMessage({ text: 'Hola', recipient: { type: 'facebook_comment', commentId: 'comment-1' } });
    expect(post).toHaveBeenCalledWith('https://graph.facebook.com/v23.0/comment-1/private_replies', { message: 'Hola' }, expect.any(Object));
  });
});
