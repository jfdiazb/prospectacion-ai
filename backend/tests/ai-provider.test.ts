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
    await provider.generateReply({
      incomingText: 'Ya te dije que quiero conseguir clientes', isNewLead: false, intent: 'discovery',
      history: [{ sender: 'ai', text: '¿Qué resultado buscas conseguir?' }, { sender: 'lead', text: 'Quiero conseguir clientes' }],
    });

    expect(generate).toHaveBeenCalledWith(expect.stringContaining('No repitas preguntas'));
    expect(generate).toHaveBeenCalledWith(expect.stringContaining('Quiero conseguir clientes'));
    generate.mockRestore();
  });

  test('detects explicit human requests and sensitive complaints conservatively', () => {
    expect(AlmaService.detectHandoffReason('Quiero hablar con un asesor humano')).toBe('explicit_human_request');
    expect(AlmaService.detectHandoffReason('Necesito poner un reclamo')).toBe('sensitive_or_complaint');
    expect(AlmaService.detectHandoffReason('Quiero conocer el precio')).toBeNull();
  });
});
