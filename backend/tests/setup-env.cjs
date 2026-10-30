// Keep the default Jest suite hermetic even when a developer has live keys in .env.
process.env.NODE_ENV = 'test';
process.env.AI_MODE = 'mock';
delete process.env.AI_PROVIDER;
delete process.env.GROQ_API_KEY;
delete process.env.GEMINI_API_KEY;

// Render injects production channel modes into the build command. Tests must
// never inherit those modes or select an official outbound provider.
process.env.REAL_OUTBOUND_ENABLED = 'false';
process.env.INSTAGRAM_REAL_OUTBOUND_ENABLED = 'false';
process.env.FACEBOOK_REAL_OUTBOUND_ENABLED = 'false';
process.env.META_AUTO_SEND_ENABLED = 'false';
process.env.FACEBOOK_AUTO_SEND_ENABLED = 'false';
process.env.WHATSAPP_AUTO_REPLY_ENABLED = 'false';
process.env.WHATSAPP_REPLY_MODE = 'assisted';
process.env.META_MESSAGING_MODE = 'mock';
process.env.INSTAGRAM_MESSAGING_MODE = 'mock';
process.env.FACEBOOK_MESSAGING_MODE = 'mock';
process.env.WHATSAPP_MESSAGING_MODE = 'mock';
process.env.YOUTUBE_MESSAGING_MODE = 'mock';
process.env.YOUTUBE_INGESTION_MODE = 'mock';
process.env.YOUTUBE_POLLING_ENABLED = 'false';
process.env.AUTOMATION_WORKER_ENABLED = 'false';
process.env.TIKTOK_API_APPROVED = 'false';
process.env.TIKTOK_INGESTION_ENABLED = 'false';
process.env.TIKTOK_MESSAGING_ENABLED = 'false';
delete process.env.CRM_OWNER_ID;
