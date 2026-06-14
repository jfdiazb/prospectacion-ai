import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@components/shared';

export const NotFoundPage = () => {
  return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center px-4 py-16 text-center text-white">
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-2xl rounded-[2rem] border border-dark-700 bg-dark-800/90 p-10 shadow-card"
      >
        <p className="text-sm uppercase tracking-[0.3em] text-dark-500">404</p>
        <h1 className="mt-4 text-5xl font-semibold">Página no encontrada</h1>
        <p className="mt-4 text-dark-300">La ruta que buscas no existe o fue movida. Te llevamos de regreso al inicio.</p>

        <div className="mt-8 flex justify-center">
          <Link to="/">
            <Button variant="primary" size="lg">Volver al inicio</Button>
          </Link>
        </div>
      </motion.div>
    </div>
  );
};
