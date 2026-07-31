import { motion } from 'framer-motion';
import { AppLayout } from '@components/AppLayout';
import { Card, Button } from '@components/shared';

const pipeline = [
  { stage: 'Nuevos', value: 26, color: 'bg-primary-500' },
  { stage: 'Contactados', value: 14, color: 'bg-green-500' },
  { stage: 'Interesados', value: 9, color: 'bg-yellow-500' },
  { stage: 'Negociación', value: 5, color: 'bg-red-500' },
];

export const CrmPage = () => {
  return (
    <AppLayout
      title="CRM"
      subtitle="Visualiza tus relaciones con clientes y optimiza el flujo de interacción."
    >
      <div className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
        <section className="space-y-6">
          <Card>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-white">Embudo de oportunidades</h2>
                <p className="text-dark-400">Controla el avance de tus prospectos por etapa.</p>
              </div>
              <Button variant="secondary">Exportar informe</Button>
            </div>
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            {pipeline.map((item, index) => (
              <motion.div
                key={item.stage}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.08 }}
              >
                <Card hover>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm text-dark-400">{item.stage}</p>
                      <p className="text-3xl font-semibold text-white">{item.value}</p>
                    </div>
                    <div className={`h-12 w-12 rounded-3xl ${item.color} bg-opacity-30`} />
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        </section>

        <aside className="space-y-4">
          <Card>
            <div className="space-y-4">
              <p className="text-sm uppercase tracking-[0.3em] text-dark-500">Contactos prioritarios</p>
              <div className="space-y-3">
                <div className="rounded-3xl bg-dark-900 p-4">
                  <p className="text-sm text-dark-400">Juan Pérez</p>
                  <p className="font-semibold text-white">Cita pendiente</p>
                </div>
                <div className="rounded-3xl bg-dark-900 p-4">
                  <p className="text-sm text-dark-400">Sofia Ramos</p>
                  <p className="font-semibold text-white">Envía propuesta</p>
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <div className="space-y-4">
              <p className="text-sm uppercase tracking-[0.3em] text-dark-500">Acciones rápidas</p>
              <div className="grid gap-3">
                <Button variant="primary" className="w-full">Nuevo contacto</Button>
                <Button variant="secondary" className="w-full">Registrar llamada</Button>
              </div>
            </div>
          </Card>
        </aside>
      </div>
    </AppLayout>
  );
};
