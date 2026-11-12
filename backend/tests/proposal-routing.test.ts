import { ProposalRoutingError, ProposalRoutingService } from '../src/services/ProposalRoutingService';

const conversation = (platform: string) => ({ messages: [{ platform, direction: 'inbound' }] });

const messengerConversation = {
  messages: [{
    sender: 'lead', direction: 'inbound', platform: 'facebook', eventType: 'direct_message',
    externalMessageId: 'meta:facebook:m_current', timestamp: '2026-11-10T03:29:32.145Z',
  }],
};

describe('ProposalRoutingService', () => {
  test('routes an Instagram proposal only to its Instagram recipient', () => {
    expect(ProposalRoutingService.resolve(
      { platform: 'instagram', recipient: { type: 'instagram_user', externalId: 'ig-scoped-1' } },
      conversation('instagram'),
    )).toEqual({ channel: 'instagram', recipient: { type: 'instagram_user', instagramScopedId: 'ig-scoped-1' } });
  });

  test('never falls back from an Instagram conversation to WhatsApp', () => {
    expect(() => ProposalRoutingService.resolve(
      { platform: 'whatsapp', recipient: { type: 'whatsapp_user', externalId: '573001234567' } },
      conversation('instagram'),
    )).toThrow(ProposalRoutingError);
  });

  test('keeps WhatsApp proposals isolated on the WhatsApp recipient', () => {
    expect(ProposalRoutingService.resolve(
      { platform: 'whatsapp', recipient: { type: 'whatsapp_user', externalId: '573001234567' } },
      conversation('whatsapp'),
    )).toEqual({ channel: 'whatsapp', recipient: { type: 'whatsapp_user', phoneNumber: '573001234567' } });
  });

  test('does not mark simulated delivery as a real send', () => {
    expect(ProposalRoutingService.proposalStatus('simulated')).toBe('simulated');
  });

  test('marks provider-confirmed live delivery as sent', () => {
    expect(ProposalRoutingService.proposalStatus('sent')).toBe('sent');
  });

  test('rejects an old Facebook comment proposal after a Messenger DM', () => {
    const proposal = {
      platform: 'facebook', recipient: { type: 'facebook_comment', externalId: 'comment-old' },
      sourceEventId: 'meta:facebook:comment-old', createdAt: '2026-11-09T20:00:00.000Z',
    };
    expect(ProposalRoutingService.isCurrentForConversation(proposal, messengerConversation)).toBe(false);
    expect(() => ProposalRoutingService.resolve(proposal, messengerConversation)).toThrow('mensaje anterior');
  });

  test('routes the proposal linked to the latest Messenger event as facebook_user', () => {
    const proposal = {
      platform: 'facebook', recipient: { type: 'facebook_user', externalId: 'psid-redacted' },
      sourceEventId: 'meta:facebook:m_current', createdAt: '2026-11-10T03:29:33.000Z',
      contextSnapshot: { lastLeadMessageId: 'meta:facebook:m_current', recipientType: 'facebook_user' },
    };
    expect(ProposalRoutingService.resolve(proposal, messengerConversation)).toEqual({
      channel: 'facebook', recipient: { type: 'facebook_user', pageScopedId: 'psid-redacted' },
    });
  });

  test('accepts an automation proposal created for the current event in an existing conversation', () => {
    const proposal = {
      platform: 'facebook', recipient: { type: 'facebook_user', externalId: 'psid-redacted' },
      sourceEventId: 'automation:execution:action', createdAt: '2026-11-10T03:29:34.000Z',
      contextSnapshot: { lastLeadMessageId: 'meta:facebook:m_current', recipientType: 'facebook_user' },
    };
    expect(ProposalRoutingService.isCurrentForConversation(proposal, messengerConversation)).toBe(true);
  });
});
