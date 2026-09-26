// Keep the default Jest suite hermetic even when a developer has live keys in .env.
process.env.NODE_ENV = 'test';
process.env.AI_MODE = 'mock';
delete process.env.AI_PROVIDER;
delete process.env.GROQ_API_KEY;
delete process.env.GEMINI_API_KEY;
