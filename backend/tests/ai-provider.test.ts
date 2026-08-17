import { getAIProvider } from '../src/integrations/ai';
import { GeminiAIProvider } from '../src/integrations/ai/GeminiAIProvider';
import { GeminiService } from '../src/services/GeminiService';
import { AlmaService } from '../src/services/AlmaService';

describe('AI provider selection', () => {
  const originalEnv = process.env;
  afterEach(() => { process.env = { ...originalEnv }; });

  test('AI_MODE=mock overrides an available Gemini key', () => {
    process.env.AI_MODE = 'mock';
    process.env.GEMINI_API_KEY = 'not-used';
    expect(getAIProvider().name).toBe('mock');
  });

  test('AI_MODE=live selects Gemini explicitly', () => {
    process.env.AI_MODE = 'live';
    process.env.GEMINI_API_KEY = 'test-key';
    expect(getAIProvider().name).toBe('gemini');
  });

  test('legacy selection remains compatible when AI_MODE is absent', () => {
    delete process.env.AI_MODE;
    delete process.env.GEMINI_API_KEY;
    expect(getAIProvider().name).toBe('mock');
  });

  test('Gemini receives conversation history and an anti-repetition instruction', async () => {
    const generate = jest.spyOn(GeminiService, 'generateResponse').mockResolvedValue('Respuesta distinta');
    const provider = new GeminiAIProvider();
    const result = await provider.generateReply({
      incomingText: 'Ya te dije que quiero conseguir clientes', isNewLead: false, intent: 'discovery', platform: 'whatsapp',
      history: [{ sender: 'ai', text: '¿Qué resultado buscas conseguir?' }, { sender: 'lead', text: 'Quiero conseguir clientes' }],
    });

    expect(generate).toHaveBeenCalledWith(expect.stringContaining('No repitas preguntas'));
    expect(generate).toHaveBeenCalledWith(expect.stringContaining('Quiero conseguir clientes'));
    expect(generate).toHaveBeenCalledWith(expect.stringContaining('WhatsApp privado'));
    expect(result).toEqual({ text: 'Respuesta distinta', aiProviderUsed: 'gemini' });
    generate.mockRestore();
  });

  test('replaces an exact repeated ALMA response before delivery', () => {
    const result = AlmaService.avoidRepeatedResponse('¿Que has intentado hasta ahora para resolverlo?', [
      { sender: 'ai', text: '¿Qué has intentado hasta ahora para resolverlo?' },
      { sender: 'lead', text: 'He publicado contenido' },
    ]);

    expect(result.deduplicated).toBe(true);
    expect(result.text).not.toMatch(/has intentado hasta ahora/i);
  });

  test('keeps a new response unchanged', () => {
    expect(AlmaService.avoidRepeatedResponse('Una respuesta nueva', [{ sender: 'ai', text: 'Respuesta anterior' }]))
      .toEqual({ text: 'Una respuesta nueva', deduplicated: false });
  });

  test('Gemini failure falls back without breaking the conversation', async () => {
    const generate = jest.spyOn(GeminiService, 'generateResponse').mockRejectedValue(new Error('provider unavailable'));
    const provider = new GeminiAIProvider();
    const result = await provider.generateReply({
      incomingText: 'Quiero informacion', isNewLead: false, intent: 'discovery', platform: 'whatsapp', history: [],
    });
    expect(result.text).toContain('principal dificultad');
    expect(result.aiProviderUsed).toBe('mock');
    generate.mockRestore();
  });

  test('detects explicit human requests and sensitive complaints conservatively', () => {
    expect(AlmaService.detectHandoffReason('Quiero hablar con un asesor humano')).toBe('explicit_human_request');
    expect(AlmaService.detectHandoffReason('Necesito poner un reclamo')).toBe('sensitive_or_complaint');
    expect(AlmaService.detectHandoffReason('Quiero conocer el precio')).toBeNull();
  });
});
