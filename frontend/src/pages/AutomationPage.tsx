import { motion } from 'framer-motion';
import { AppLayout } from '@components/AppLayout';
import { Button, Card, Badge } from '@components/shared';

const automations = [
  { title: 'Secuencia de bienvenida', status: 'Activa', nextStep: 'Email 2', users: 42 },
  { title: 'Re-engagement', status: 'En pausa', nextStep: 'Mensaje SMS', users: 15 },
  { title: 'Calificación automática', status: 'Activa', nextStep: 'Formulario', users: 87 },
];

export const AutomationPage = () => {
  return (
    <AppLayout
      title="Automatizaciones"
      subtitle="Visión general de secuencias activas y comportamiento de tus flujos."
    >
      <div className="grid gap-6 xl:grid-cols-[1fr_0.7fr]">
        <section className="space-y-6">
          <Card>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-white">Automatizaciones activas</h2>
                <p className="text-dark-400">Controla secuencias, condiciones y rendimiento en un solo lugar.</p>
              </div>
              <Button variant="primary">Crear nueva</Button>
            </div>
          </Card>

          <div className="space-y-4">
            {automations.map((automation, index) => (
              <motion.div
                key={automation.title}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.08 }}
              >
                <Card hover>
                  <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <h3 className="text-xl font-semibold text-white">{automation.title}</h3>
                      <p className="text-dark-400">Próximo paso: {automation.nextStep}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <Badge variant={automation.status === 'Activa' ? 'success' : 'warning'}>
                        {automation.status}
                      </Badge>
                      <span className="text-sm text-dark-400">{automation.users} leads activos</span>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        </section>

        <aside className="space-y-4">
          <Card>
            <div className="space-y-4">
              <p className="text-sm uppercase tracking-[0.3em] text-dark-500">Rendimiento</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-3xl bg-dark-900 p-4">
                  <p className="text-sm text-dark-400">Conversiones</p>
                  <p className="text-3xl font-semibold text-white">72%</p>
                </div>
                <div className="rounded-3xl bg-dark-900 p-4">
                  <p className="text-sm text-dark-400">Tasa apertura</p>
                  <p className="text-3xl font-semibold text-white">48%</p>
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <div className="space-y-4">
              <p className="text-sm uppercase tracking-[0.3em] text-dark-500">Sugerencias</p>
              <ul className="space-y-3 text-dark-300">
                <li>Mejora tus mensajes con variables personalizadas.</li>
                <li>Segmenta prospectos por interés y etapa.</li>
                <li>Configura recordatorios automáticos de seguimiento.</li>
              </ul>
            </div>
          </Card>
        </aside>
      </div>
    </AppLayout>
  );
};
