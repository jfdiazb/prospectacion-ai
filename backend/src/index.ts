import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './config/database';
import authRoutes from './routes/authRoutes';
import leadRoutes from './routes/leadRoutes';
import hunterRoutes from './routes/hunterRoutes';
import scraperRoutes from './routes/scraperRoutes';
import aiRoutes from './routes/aiRoutes';
import { errorMiddleware, notFoundMiddleware } from './middlewares/auth';
import whatsappRoutes from './routes/whatsappRoutes';

dotenv.config();
console.log("MONGO_URI =>", process.env.MONGO_URI);

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 5001;
const API_PREFIX = '/api/v1';

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Backend funcionando 🚀');
});

app.use(`${API_PREFIX}/auth`, authRoutes);
app.use(`${API_PREFIX}/leads`, leadRoutes);
app.use(`${API_PREFIX}/lead-hunter`, hunterRoutes);
app.use(`${API_PREFIX}/social-scraper`, scraperRoutes);
app.use(`${API_PREFIX}/ai`, aiRoutes);
app.use('/api/v1/whatsapp', whatsappRoutes);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

export const startServer = async () => {
  await connectDB();
  return app.listen(PORT, () => {
    console.log(`✅ Backend running on http://localhost:${PORT}`);
  });
};

if (process.env.NODE_ENV !== 'test') {
  startServer().catch(error => {
    console.error('❌ Error iniciando servidor:', error);
    process.exit(1);
  });
}
