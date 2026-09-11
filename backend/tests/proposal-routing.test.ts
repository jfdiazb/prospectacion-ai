import { ProposalRoutingError, ProposalRoutingService } from '../src/services/ProposalRoutingService';

const conversation = (platform: string) => ({ messages: [{ platform, direction: 'inbound' }] });

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
});
