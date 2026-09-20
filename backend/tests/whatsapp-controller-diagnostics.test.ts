import { WhatsAppController } from '../src/controllers/WhatsAppController';

describe('WhatsApp asynchronous diagnostics', () => {
  test('requires both the kill switch and automatic mode for automatic replies', () => {
    expect(WhatsAppController.isAutomaticReplyEnabled({
      WHATSAPP_AUTO_REPLY_ENABLED: 'true',
      WHATSAPP_REPLY_MODE: 'assisted',
    } as NodeJS.ProcessEnv)).toBe(false);
    expect(WhatsAppController.isAutomaticReplyEnabled({
      WHATSAPP_AUTO_REPLY_ENABLED: 'false',
      WHATSAPP_REPLY_MODE: 'automatic',
    } as NodeJS.ProcessEnv)).toBe(false);
    expect(WhatsAppController.isAutomaticReplyEnabled({
      WHATSAPP_AUTO_REPLY_ENABLED: 'true',
      WHATSAPP_REPLY_MODE: 'automatic',
    } as NodeJS.ProcessEnv)).toBe(true);
  });

  test('reports stage, provider and a safe correlation id without private content', () => {
    const error = Object.assign(new Error('private conversation text'), {
      processingStage: 'automatic_response',
      provider: 'groq',
    });

    const details = WhatsAppController.asynchronousErrorDetails(error, 'wamid.private-external-id');

    expect(details).toEqual({
      stage: 'automatic_response',
      errorType: 'Error',
      provider: 'groq',
      correlationId: expect.stringMatching(/^[a-f0-9]{16}$/),
    });
    expect(JSON.stringify(details)).not.toContain('private conversation text');
    expect(JSON.stringify(details)).not.toContain('wamid.private-external-id');
  });

  test('labels failures before durable claiming without exposing the message id', () => {
    const details = WhatsAppController.asynchronousErrorDetails(new Error('claim failed'), 'wamid.claim');
    expect(details).toMatchObject({ stage: 'inbound_claim', provider: 'whatsapp' });
    expect(JSON.stringify(details)).not.toContain('wamid.claim');
  });
});
