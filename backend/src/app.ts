import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import authRoutes from './routes/authRoutes';
import leadRoutes from './routes/leadRoutes';
import hunterRoutes from './routes/hunterRoutes';
import scraperRoutes from './routes/scraperRoutes';
import aiRoutes from './routes/aiRoutes';
import whatsappRoutes from './routes/whatsappRoutes';
import metaRoutes from './routes/metaRoutes';
import crmRoutes from './routes/crmRoutes';
import youtubeRoutes from './routes/youtubeRoutes';
import calendlyRoutes from './routes/calendlyRoutes';
import automationRoutes from './routes/automationRoutes';
import { errorMiddleware, notFoundMiddleware } from './middlewares/auth';
import { generalLimiter } from './middlewares/rateLimiter';
import { getAIRuntimeStatus } from './integrations/ai';

const apiPrefix = '/api/v1';
const configuredOrigins = (process.env.CORS_ORIGIN ?? '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

const app = express();

app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || configuredOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origen no permitido por CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type'],
}));
app.use(`${apiPrefix}/whatsapp/webhook`, express.raw({ type: 'application/json', limit: '1mb' }));
app.use(`${apiPrefix}/meta/webhook`, express.raw({ type: 'application/json', limit: '1mb' }));
app.use(`${apiPrefix}/calendly/webhook`, express.raw({ type: 'application/json', limit: '256kb' }));
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.status(200).json({
    success: true,
    status: 'ok',
    runtime: { ai: getAIRuntimeStatus() },
  });
});

app.use(generalLimiter);

app.use(`${apiPrefix}/auth`, authRoutes);
app.use(`${apiPrefix}/leads`, leadRoutes);
app.use(`${apiPrefix}/lead-hunter`, hunterRoutes);
app.use(`${apiPrefix}/social-scraper`, scraperRoutes);
app.use(`${apiPrefix}/ai`, aiRoutes);
app.use(`${apiPrefix}/whatsapp`, whatsappRoutes);
app.use(`${apiPrefix}/meta`, metaRoutes);
app.use(`${apiPrefix}/crm`, crmRoutes);
app.use(`${apiPrefix}/youtube`, youtubeRoutes);
app.use(`${apiPrefix}/calendly`, calendlyRoutes);
app.use(`${apiPrefix}/automations`, automationRoutes);
app.use(notFoundMiddleware);
app.use(errorMiddleware);

export default app;
