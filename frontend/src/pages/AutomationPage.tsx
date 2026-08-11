import { FormEvent, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { AppLayout } from '@components/AppLayout';
import { Button, Card, Badge } from '@components/shared';
import { Modal } from '@components/advanced';
import { automationService, type AutomationFlow } from '@services/automationService';

export const AutomationPage = () => {
  const [flows, setFlows] = useState<AutomationFlow[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({ name: '', keyword: 'INFO', message: '' });
  const load = async () => { setLoading(true); try { setFlows(await automationService.list()); } catch { setMessage('No fue posible cargar las automatizaciones.'); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, []);
  const create = async (event: FormEvent) => { event.preventDefault(); setLoading(true); try { const flow = await automationService.create(form); setFlows(current => [flow, ...current]); setOpen(false); setForm({ name: '', keyword: 'INFO', message: '' }); setMessage('Automatización creada correctamente.'); } catch (error: any) { setMessage(error?.response?.data?.message || 'No fue posible crear la automatización.'); } finally { setLoading(false); } };
  const toggle = async (id: string) => { const flow = await automationService.toggle(id); setFlows(current => current.map(item => item._id === id ? flow : item)); };
  const remove = async (id: string) => { if (!window.confirm('¿Eliminar esta automatización?')) return; await automationService.remove(id); setFlows(current => current.filter(item => item._id !== id)); };

  return <AppLayout title="Automatizaciones" subtitle="Crea y controla flujos reales asociados a tu cuenta.">
    <div className="space-y-6"><Card hover={false}><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-2xl font-semibold text-white">Automatizaciones</h2><p className="text-dark-400">Los flujos se guardan en el CRM y permanecen aislados por usuario.</p></div><Button onClick={() => setOpen(true)}>Crear nueva</Button></div>{message && <p className="mt-4 text-sm text-primary-300">{message}</p>}</Card>
      <div className="space-y-4">{flows.map((flow, index) => <motion.div key={flow._id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}><Card hover={false}><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><h3 className="text-xl font-semibold text-white">{flow.name}</h3><p className="text-dark-400">Palabra clave: {flow.trigger.keyword || 'Sin configurar'} · {flow.executionStats?.totalExecutions || 0} ejecuciones</p></div><div className="flex flex-wrap items-center gap-3"><Badge variant={flow.isActive ? 'success' : 'warning'}>{flow.isActive ? 'Activa' : 'En pausa'}</Badge><Button variant="secondary" size="sm" onClick={() => void toggle(flow._id)}>{flow.isActive ? 'Pausar' : 'Activar'}</Button><Button variant="danger" size="sm" onClick={() => void remove(flow._id)}>Eliminar</Button></div></div></Card></motion.div>)}{!loading && flows.length === 0 && <Card hover={false}><p className="text-dark-400">Aún no tienes automatizaciones. Crea la primera con una palabra clave y una respuesta.</p></Card>}</div>
    </div>
    <Modal isOpen={open} onClose={() => setOpen(false)} title="Nueva automatización" size="lg"><form onSubmit={create} className="space-y-4"><Field label="Nombre" value={form.name} onChange={value => setForm({ ...form, name: value })} placeholder="Bienvenida YouTube" /><Field label="Palabra clave" value={form.keyword} onChange={value => setForm({ ...form, keyword: value })} placeholder="INFO" /><div><label className="mb-2 block text-sm text-dark-300">Respuesta</label><textarea required value={form.message} onChange={event => setForm({ ...form, message: event.target.value })} className="min-h-32 w-full rounded-2xl border border-dark-600 bg-dark-900 p-4 text-white" placeholder="Gracias por escribir..." /></div><div className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit" loading={loading}>Crear</Button></div></form></Modal>
  </AppLayout>;
};

const Field = ({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) => <div><label className="mb-2 block text-sm text-dark-300">{label}</label><input required value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} className="w-full rounded-2xl border border-dark-600 bg-dark-900 px-4 py-3 text-white" /></div>;
