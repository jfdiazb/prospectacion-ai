import { motion } from 'framer-motion';
import { useMemo, useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AppLayout } from '@components/AppLayout';
import { Card, Button, Badge } from '@components/shared';
import { Modal } from '@components/advanced';
import { aiService } from '@services/aiService';
import { leadService } from '@services/leadService';
import type { ILead } from '@types';

/**
 * Página de Leads (CRM)
 */
export const LeadsPage = () => {
  const [leads, setLeads] = useState<ILead[]>([]);
  const [page] = useState(1);
  const [selectedLead, setSelectedLead] = useState<ILead | null>(null);
  const [generatedMessage, setGeneratedMessage] = useState<string>('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ username: '', fullName: '', bio: '' });
  const [feedback, setFeedback] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const searchTerm = searchParams.get('buscar')?.trim() ?? '';

  const visibleLeads = useMemo(() => {
    if (!searchTerm) return leads;
    const normalized = searchTerm.toLocaleLowerCase('es');
    return leads.filter(lead => [lead.username, lead.fullName, lead.bio, lead.platform]
      .some(value => value?.toLocaleLowerCase('es').includes(normalized)));
  }, [leads, searchTerm]);

  useEffect(() => {
    loadLeads();
  }, [page]);

  const loadLeads = async () => {
    try {
      const data = await leadService.getLeads(page, 20);
      setLeads(data.data);
    } catch (error) {
      console.error('Error cargando leads:', error);
    }
  };

  const handleGenerateMessage = async (lead: ILead) => {
    setSelectedLead(lead);
    setGeneratedMessage('');
    setIsModalOpen(true);
    setIsGenerating(true);

    try {
      const message = await aiService.generateMessage({
        username: lead.username,
        bio: lead.bio,
        platform: lead.platform,
        interestLevel: lead.interestLevel,
      });
      setGeneratedMessage(message);
    } catch (error) {
      console.error('Error generando mensaje AI:', error);
      setGeneratedMessage('No se pudo generar el mensaje. Intenta nuevamente.');
    } finally {
      setIsGenerating(false);
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedLead(null);
    setGeneratedMessage('');
  };

  const createLead = async () => {
    if (!form.username.trim()) { setFeedback('El identificador del prospecto es obligatorio.'); return; }
    try { const lead = await leadService.createLead({ ...form, platform: 'manual', status: 'new', interestLevel: 'cold', score: 0, tags: ['manual'] }); setLeads(current => [lead, ...current]); setCreateOpen(false); setForm({ username: '', fullName: '', bio: '' }); setFeedback('Prospecto agregado correctamente.'); }
    catch (error: any) { setFeedback(error?.response?.data?.message || 'No fue posible agregar el prospecto.'); }
  };

  return (
    <AppLayout title="Prospectos" subtitle={`Total de leads activos: ${leads.length}`}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Gestiona tus prospectos en un solo lugar</h2>
            <p className="text-dark-400">Filtra, califica y prioriza leads con rapidez.</p>
          </div>
          <Button variant="primary" onClick={() => setCreateOpen(true)}>+ Agregar Lead</Button>
        </div>
        {feedback && <p className="rounded-2xl border border-primary-500/20 bg-primary-500/10 p-4 text-sm text-primary-200">{feedback}</p>}
        {searchTerm && (
          <div className="flex flex-col gap-3 rounded-2xl border border-primary-500/20 bg-primary-500/10 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-primary-100">Resultados para <span className="font-semibold">“{searchTerm}”</span>: {visibleLeads.length}</p>
            <Button variant="secondary" size="sm" onClick={() => setSearchParams({})}>Limpiar búsqueda</Button>
          </div>
        )}

        <div className="space-y-4">
          {visibleLeads.map((lead, index) => (
            <motion.div
              key={lead._id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card hover>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-white mb-1">{lead.username}</h3>
                    <p className="text-dark-400 text-sm mb-2">{lead.bio}</p>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="primary">{lead.platform}</Badge>
                      <Badge variant={lead.interestLevel === 'hot' ? 'danger' : 'warning'}>
                        {lead.interestLevel?.toUpperCase() ?? 'DESCONOCIDO'}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex flex-col items-start gap-3 text-left lg:items-end lg:text-right">
                    <div className="text-2xl font-bold text-primary-400 mb-2">{lead.score}</div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" size="sm" onClick={() => { setSelectedLead(lead); setDetailsOpen(true); }}>
                        Ver detalles
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleGenerateMessage(lead)}
                        disabled={isGenerating}
                      >
                        {isGenerating && selectedLead?._id === lead._id ? 'Generando...' : 'Mensaje AI'}
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
          {searchTerm && visibleLeads.length === 0 && <Card><p className="text-center text-dark-300">No encontramos prospectos que coincidan con esa búsqueda.</p></Card>}
        </div>
      </motion.div>

      <Modal isOpen={isModalOpen} onClose={closeModal} title={selectedLead ? `Mensaje AI para ${selectedLead.username}` : 'Mensaje AI'} size="lg">
        <div className="space-y-4">
          <p className="text-dark-400">
            Genera un mensaje corto y personalizado para iniciar la conversación con este prospecto.
          </p>
          <div className="rounded-3xl bg-dark-900 p-5 text-sm text-dark-100 min-h-[160px]">
            {isGenerating ? (
              <p>Generando contenido con IA...</p>
            ) : generatedMessage ? (
              <p>{generatedMessage}</p>
            ) : (
              <p>No se ha generado ningún mensaje todavía.</p>
            )}
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={closeModal}>
              Cerrar
            </Button>
          </div>
        </div>
      </Modal>
      <Modal isOpen={detailsOpen} onClose={() => setDetailsOpen(false)} title="Detalles del prospecto" size="lg"><div className="space-y-4 text-dark-200"><p><span className="text-dark-400">Nombre:</span> {selectedLead?.fullName || selectedLead?.username}</p><p><span className="text-dark-400">Canal:</span> {selectedLead?.platform}</p><p><span className="text-dark-400">Score:</span> {selectedLead?.score}</p><p><span className="text-dark-400">Estado:</span> {selectedLead?.status}</p><p><span className="text-dark-400">Descripción:</span> {selectedLead?.bio || 'Sin descripción'}</p><div className="flex justify-end"><Button variant="secondary" onClick={() => setDetailsOpen(false)}>Cerrar</Button></div></div></Modal>
      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Agregar prospecto" size="lg"><div className="space-y-4"><input value={form.username} onChange={event => setForm({ ...form, username: event.target.value })} placeholder="Identificador o usuario" className="w-full rounded-2xl border border-dark-600 bg-dark-900 px-4 py-3 text-white" /><input value={form.fullName} onChange={event => setForm({ ...form, fullName: event.target.value })} placeholder="Nombre completo" className="w-full rounded-2xl border border-dark-600 bg-dark-900 px-4 py-3 text-white" /><textarea value={form.bio} onChange={event => setForm({ ...form, bio: event.target.value })} placeholder="Notas o descripción" className="min-h-28 w-full rounded-2xl border border-dark-600 bg-dark-900 p-4 text-white" /><div className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancelar</Button><Button onClick={() => void createLead()}>Guardar prospecto</Button></div></div></Modal>
    </AppLayout>
  );
};
