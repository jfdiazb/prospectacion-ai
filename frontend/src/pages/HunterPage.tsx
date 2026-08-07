import { motion } from 'framer-motion';
import { useState } from 'react';
import { AppLayout } from '@components/AppLayout';
import { Card, Button, Badge } from '@components/shared';
import { hunterService } from '@services/hunterService';
import type { IHunterProfile } from '@types';

export const HunterPage = () => {
  const [keyword, setKeyword] = useState('marketing digital');
  const [platform, setPlatform] = useState('youtube');
  const [profiles, setProfiles] = useState<IHunterProfile[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    try {
      setLoading(true);
      const response = await hunterService.searchProfiles({ keyword, platform });
      setProfiles(response.data || []);
    } catch (error) {
      console.error('Error buscando canales:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout title="YouTube Lead Hunter" subtitle="Busca y analiza canales y creadores de YouTube para convertirlos en prospectos." >
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <Card>
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold text-white">Búsqueda inteligente</h2>
                <p className="text-dark-400">Introduce una palabra clave para encontrar canales de YouTube relacionados.</p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <input
                  type="text"
                  value={keyword}
                  onChange={e => setKeyword(e.target.value)}
                  placeholder="Ej. marketing digital"
                  className="w-full rounded-2xl border border-white/10 bg-dark-900/95 px-4 py-3 text-sm text-white outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                />
                <select
                  value={platform}
                  onChange={e => setPlatform(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-dark-900/95 px-4 py-3 text-sm text-white outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                >
                  <option value="youtube">YouTube</option>
                </select>
              </div>

              <Button variant="primary" onClick={handleSearch} disabled={loading}>
                {loading ? 'Buscando...' : 'Buscar canales'}
              </Button>
            </div>
          </Card>

          <Card>
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white">Resultados</h3>
              <p className="text-dark-400">Los canales encontrados se mostrarán aquí para analizarlos y convertirlos en leads.</p>
              <div className="rounded-3xl border border-white/10 bg-dark-900/95 p-4 text-sm text-dark-300">
                <p>
                  {profiles.length} canal{profiles.length === 1 ? '' : 'es'} encontrado{profiles.length === 1 ? '' : 's'}.
                </p>
              </div>
            </div>
          </Card>
        </div>

        <div className="grid gap-4">
          {profiles.map(profile => (
            <Card key={profile.username} hover>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold text-white">{profile.fullName || profile.username}</h3>
                    <Badge variant="secondary">{profile.platform}</Badge>
                    <Badge variant={profile.interestLevel === 'hot' ? 'danger' : 'warning'}>{profile.interestLevel?.toUpperCase() || 'WARM'}</Badge>
                  </div>
                  <p className="text-dark-400 text-sm">{profile.bio}</p>
                  <div className="flex flex-wrap gap-2 text-sm text-dark-300">
                    <span>{profile.followers ?? 0} seguidores</span>
                    <span>{profile.engagement ?? 0}% engagement</span>
                  </div>
                </div>
                <div className="text-left lg:text-right">
                  <div className="text-2xl font-bold text-primary-400">{profile.score ?? '—'}</div>
                  <div className="text-sm text-dark-300">{profile.tags?.join(', ')}</div>
                  <a
                    href={profile.profileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center rounded-lg border border-white/10 bg-dark-700 px-3 py-2 text-sm font-medium text-dark-100 transition hover:bg-dark-600"
                  >
                    Ver canal
                  </a>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </motion.div>
    </AppLayout>
  );
};
