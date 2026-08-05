import './config/env';
import app from './app';
import { connectDB } from './config/database';
import { validateServerEnvironment } from './config/env';

const port = Number(process.env.PORT ?? 5001);

export const startServer = async () => {
  validateServerEnvironment();
  await connectDB();
  return app.listen(port, () => console.info(`API ALMA iniciada en el puerto ${port}`));
};

if (process.env.NODE_ENV !== 'test') {
  startServer().catch(error => {
    console.error('No fue posible iniciar la API', error);
    process.exit(1);
  });
}
