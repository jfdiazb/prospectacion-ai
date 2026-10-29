import fs from 'fs';
import path from 'path';

describe('modos automáticos de producción', () => {
  test('Render activa solo los cuatro canales oficiales disponibles y mantiene TikTok apagado', () => {
    const blueprint = fs.readFileSync(path.resolve(__dirname, '../../render.yaml'), 'utf8');
    const valueFor = (key: string) => blueprint.match(
      new RegExp(`- key: ${key}\\r?\\n(?:\\s+#.*\\r?\\n)*\\s+value: ["']?([^"'\\r\\n]+)`)
    )?.[1].trim();

    expect(valueFor('AI_MODE')).toBe('live');
    expect(valueFor('AI_PROVIDER')).toBe('groq');
    expect(valueFor('REAL_OUTBOUND_ENABLED')).toBe('true');
    expect(valueFor('WHATSAPP_MESSAGING_MODE')).toBe('live');
    expect(valueFor('WHATSAPP_AUTO_REPLY_ENABLED')).toBe('true');
    expect(valueFor('WHATSAPP_REPLY_MODE')).toBe('automatic');
    expect(valueFor('INSTAGRAM_MESSAGING_MODE')).toBe('live');
    expect(valueFor('META_AUTO_SEND_ENABLED')).toBe('true');
    expect(valueFor('FACEBOOK_MESSAGING_MODE')).toBe('live');
    expect(valueFor('FACEBOOK_AUTO_SEND_ENABLED')).toBe('true');
    expect(valueFor('YOUTUBE_MESSAGING_MODE')).toBe('live');
    expect(valueFor('YOUTUBE_INGESTION_MODE')).toBe('live');
    expect(valueFor('YOUTUBE_POLLING_ENABLED')).toBe('true');
    expect(valueFor('TIKTOK_API_APPROVED')).toBe('false');
    expect(valueFor('TIKTOK_INGESTION_ENABLED')).toBe('false');
    expect(valueFor('TIKTOK_MESSAGING_ENABLED')).toBe('false');
  });
});
