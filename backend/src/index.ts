import './config/env';
import app from './app';
import { connectDB } from './config/database';
import { validateDatabaseEnvironment, validateServerEnvironment } from './config/env';
import { startYouTubePolling } from './services/YouTubeIngestionService';
import { startCalendlyPolling } from './services/CalendlyPollingService';
import { getAIRuntimeStatus } from './integrations/ai';
import { startAutomationWorker } from './services/AutomationEngineService';

const port = Number(process.env.PORT ?? 5001);

export const startServer = async () => {
  validateServerEnvironment();
  await connectDB();
  await validateDatabaseEnvironment();
  startYouTubePolling();
  startCalendlyPolling();
  startAutomationWorker();
  return app.listen(port, () => {
    console.info(`API ALMA iniciada en el puerto ${port}`);
    console.info('ALMA AI runtime', getAIRuntimeStatus());
  });
};

if (process.env.NODE_ENV !== 'test') {
  startServer().catch(error => {
    console.error('No fue posible iniciar la API', error);
    process.exit(1);
  });
}
