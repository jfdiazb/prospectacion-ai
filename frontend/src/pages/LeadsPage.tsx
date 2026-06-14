import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { AppLayout } from '@components/AppLayout';
import { Card, Button, Badge } from '@components/shared';
import { leadService } from '@services/leadService';

/**
 * Página de Leads (CRM)
 */
export const LeadsPage = () => {
  const [leads, setLeads] = useState<any[]>([]);
  const [page] = useState(1);

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
                        {lead.interestLevel.toUpperCase()}
                      </Badge>
                    </div>
                  </div>
                  <div className="text-left lg:text-right">
                    <div className="text-2xl font-bold text-primary-400 mb-2">{lead.score}</div>
                    <Button variant="secondary" size="sm">
                      Ver detalles
                    </Button>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </AppLayout>
  );
};
