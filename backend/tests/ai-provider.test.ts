import { getAIProvider } from '../src/integrations/ai';
import { GeminiAIProvider } from '../src/integrations/ai/GeminiAIProvider';
import { GeminiService } from '../src/services/GeminiService';
import { AlmaService } from '../src/services/AlmaService';
import { ConversationService } from '../src/services/ConversationService';

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

  test('blocks a semantically repeated question stored outside the recent history', () => {
    const result = AlmaService.avoidRepeatedResponse('¿Cuál es el obstáculo que te está frenando?', [], {
      askedTopics: ['main_obstacle'], responseFingerprints: [],
    });

    expect(result.deduplicated).toBe(true);
    expect(result.text).not.toMatch(/obstáculo|frenando/i);
  });

  test('advances after discovery questions are exhausted instead of leaving the lead unanswered', () => {
    const exhaustedResponses = [
      'Gracias por contármelo. ¿Qué obstáculo te está frenando más en este momento?',
      'Entiendo. ¿Qué tipo de apoyo consideras que te ayudaría más?',
      'Perfecto. ¿Qué cambio concreto te gustaría conseguir primero?',
      'Gracias por explicarlo. Puedo orientarte sobre el siguiente paso cuando quieras.',
    ];
    const result = AlmaService.avoidRepeatedResponse('¿Qué tipo de apoyo consideras que te ayudaría más?', [], {
      askedTopics: ['desired_outcome', 'main_obstacle', 'previous_attempts', 'support_needed'],
      responseFingerprints: exhaustedResponses.map(response => ConversationService.fingerprintAIText(response)),
    });

    expect(result.deduplicated).toBe(true);
    expect(result.text).toMatch(/primer paso/i);
    expect(result.text).not.toContain('?');
  });

  test('gives a concrete first step when the lead explicitly asks how to continue', () => {
    const history = [
      { sender: 'lead' as const, text: 'Quiero conseguir más clientes' },
      { sender: 'lead' as const, text: 'Me cuesta manejar la tecnología y las redes sociales' },
      { sender: 'ai' as const, text: 'Entendido. Podemos pasar al siguiente paso.' },
    ];
    const result = AlmaService.avoidRepeatedResponse('Entendido. Podemos pasar al siguiente paso.', history, {
      askedTopics: ['desired_outcome', 'main_obstacle', 'previous_attempts', 'support_needed'],
      responseFingerprints: [ConversationService.fingerprintAIText('Entendido. Podemos pasar al siguiente paso.')],
    }, 'OK, indícame cuál sería el primer paso');

    expect(result).toEqual(expect.objectContaining({ deduplicated: true }));
    expect(result.text).toMatch(/primer paso: define/i);
    expect(result.text).toMatch(/cliente|problema|resultado/i);
    expect(result.text).not.toMatch(/podemos pasar|cuando quieras/i);
    expect(result.text).not.toContain('?');
  });

  test('uses stable hashes without storing response text in conversational memory', () => {
    const fingerprint = ConversationService.fingerprintAIText('¿Qué resultado buscas?');
    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(fingerprint).not.toContain('resultado');
    expect(ConversationService.classifyQuestionTopic('¿Qué resultado buscas conseguir?')).toBe('desired_outcome');
    expect(ConversationService.classifyQuestionTopic('¿Qué has intentado hasta ahora?')).toBe('previous_attempts');
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
