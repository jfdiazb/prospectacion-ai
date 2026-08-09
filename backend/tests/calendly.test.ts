import crypto from 'crypto';
import { CalendlyController } from '../src/controllers/CalendlyController';

describe('Calendly webhook security', () => {
  const secret = 'calendly-test-signing-key';
  const raw = Buffer.from(JSON.stringify({ event: 'invitee.created', payload: { tracking: { utm_content: 'token' } } }));

  beforeEach(() => { process.env.CALENDLY_WEBHOOK_SIGNING_KEY = secret; });
  afterEach(() => { delete process.env.CALENDLY_WEBHOOK_SIGNING_KEY; });

  test('accepts a current valid signature', () => {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = crypto.createHmac('sha256', secret).update(`${timestamp}.${raw.toString('utf8')}`).digest('hex');
    expect(CalendlyController.isValidSignature(raw, `t=${timestamp},v1=${signature}`)).toBe(true);
  });

  test('rejects invalid and replayed signatures', () => {
    const current = Math.floor(Date.now() / 1000).toString();
    expect(CalendlyController.isValidSignature(raw, `t=${current},v1=${'0'.repeat(64)}`)).toBe(false);
    const old = Math.floor((Date.now() - 6 * 60 * 1000) / 1000).toString();
    const signature = crypto.createHmac('sha256', secret).update(`${old}.${raw.toString('utf8')}`).digest('hex');
    expect(CalendlyController.isValidSignature(raw, `t=${old},v1=${signature}`)).toBe(false);
  });
});
