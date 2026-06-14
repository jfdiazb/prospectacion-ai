import { motion } from 'framer-motion';
import { AppLayout } from '@components/AppLayout';
import { Button, Card } from '@components/shared';
import { useAuth } from '@context/AuthContext';

export const SettingsPage = () => {
  const { user, logout } = useAuth();

  return (
    <AppLayout title="Configuración" subtitle="Ajusta tu cuenta, notificaciones y preferencias del sistema.">
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
            <div className="space-y-6">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-dark-500">Cuenta</p>
                <h2 className="text-2xl font-semibold text-white">Información de usuario</h2>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-3xl bg-dark-900 p-5">
                  <p className="text-sm text-dark-400">Nombre</p>
                  <p className="mt-2 text-lg font-medium text-white">{user?.fullName || 'Usuario ProspectAI'}</p>
                </div>
                <div className="rounded-3xl bg-dark-900 p-5">
                  <p className="text-sm text-dark-400">Email</p>
                  <p className="mt-2 text-lg font-medium text-white">{user?.email || 'correo@ejemplo.com'}</p>
                </div>
              </div>

              <div className="space-y-4 rounded-3xl bg-dark-900 p-5">
                <div>
                  <p className="text-sm text-dark-400">Seguridad</p>
                  <p className="text-white">Actualiza tu contraseña y controla accesos.</p>
                </div>
                <Button variant="secondary">Cambiar contraseña</Button>
              </div>
            </div>
          </motion.div>
        </Card>

        <Card>
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
            <div className="space-y-6">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-dark-500">Preferencias</p>
                <h2 className="text-2xl font-semibold text-white">Notificaciones</h2>
              </div>

              <div className="space-y-4 rounded-3xl bg-dark-900 p-5">
                <div className="flex items-center justify-between rounded-2xl bg-dark-800 p-4">
                  <div>
                    <p className="font-medium text-white">Alertas de actividad</p>
                    <p className="text-sm text-dark-400">Recibe notificaciones cuando llegan nuevos prospectos.</p>
                  </div>
                  <span className="rounded-full bg-primary-500 px-4 py-2 text-sm font-semibold text-white">Activado</span>
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-dark-800 p-4">
                  <div>
                    <p className="font-medium text-white">Resumen semanal</p>
                    <p className="text-sm text-dark-400">Recibe un informe de tus métricas cada semana.</p>
                  </div>
                  <span className="rounded-full bg-dark-700 px-4 py-2 text-sm text-dark-300">No activo</span>
                </div>
              </div>

              <Button variant="danger" onClick={logout} className="w-full">Cerrar sesión</Button>
            </div>
          </motion.div>
        </Card>
      </div>
    </AppLayout>
  );
};
