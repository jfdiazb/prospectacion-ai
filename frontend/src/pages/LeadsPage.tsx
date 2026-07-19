import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
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

  return (
    <AppLayout title="Prospectos" subtitle={`Total de leads activos: ${leads.length}`}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Gestiona tus prospectos en un solo lugar</h2>
            <p className="text-dark-400">Filtra, califica y prioriza leads con rapidez.</p>
          </div>
          <Button variant="primary">+ Agregar Lead</Button>
        </div>

        <div className="space-y-4">
          {leads.map((lead, index) => (
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
                      <Button variant="secondary" size="sm">
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
    </AppLayout>
  );
};
