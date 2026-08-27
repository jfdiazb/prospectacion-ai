import { motion } from 'framer-motion';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@components/AppLayout';
import { Card, Button, Badge } from '@components/shared';
import { hunterService } from '@services/hunterService';
import type { IHunterProfile } from '@types';

const scoreLabels: Array<[keyof NonNullable<IHunterProfile['scores']>, string]> = [
  ['commercial', 'Perfil comercial'],
  ['jobAvailability', 'Disponibilidad laboral'],
  ['nutritionWellness', 'Nutrición/bienestar'],
  ['productSales', 'Venta de productos'],
  ['overall', 'Coincidencia general'],
];
const categoryLabels: Record<string, string> = {
  commercial: 'Comercial',
  jobAvailability: 'Laboral',
  nutritionWellness: 'Nutrición',
  productSales: 'Productos',
};
const statusLabels: Record<string, string> = {
  high_priority: 'Prioridad alta',
  good_candidate: 'Buen candidato',
  review: 'Revisar',
  low_match: 'Baja coincidencia',
};

export const HunterPage = () => {
  const navigate = useNavigate();
  const [regionCode, setRegionCode] = useState('CO');
  const [minScore, setMinScore] = useState(75);
  const [quantity, setQuantity] = useState(20);
  const [recentDays, setRecentDays] = useState(90);
  const [profiles, setProfiles] = useState<IHunterProfile[]>([]);
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [quota, setQuota] = useState<{
    projectSearchCalls: number;
    projectSearchLimit: number;
    userSearchCalls: number;
    userSearchLimit: number;
  }>();
  const [mode, setMode] = useState<'mock' | 'live'>();
  const keyFor = (p: IHunterProfile) => `${p.youtubeChannelId}:${p.youtubeVideoId || ''}`;
  const handleSearch = async () => {
    setLoading(true);
    setMessage('');
    try {
      const response = await hunterService.searchProfiles({
        profileId: 'sales_job_seeker_nutrition_v1',
        regionCode,
        minScore,
        quantity,
        recentDays,
      });
      setProfiles(response.data?.results || []);
      setQuota(response.data?.quota);
      setMode(response.data?.mode);
      setMessage(
        response.data?.mode === 'mock'
          ? 'Modo demostración: los candidatos mostrados son simulados.'
          : response.data?.cached
            ? 'Resultados reales recuperados de caché; no se consumió una nueva búsqueda.'
            : `${response.data?.results.length || 0} candidatos públicos clasificados.`
      );
    } catch (error: any) {
      setMessage(error?.response?.data?.message || 'No fue posible buscar en YouTube.');
    } finally {
      setLoading(false);
    }
  };
  const save = async (p: IHunterProfile) => {
    setLoading(true);
    try {
      const opportunity = await hunterService.saveOpportunity(p);
      setSaved(current => ({ ...current, [keyFor(p)]: opportunity._id }));
      setMessage('Oportunidad guardada.');
    } catch (error: any) {
      setMessage(error?.response?.data?.message || 'No fue posible guardar.');
    } finally {
      setLoading(false);
    }
  };
  const convert = async (p: IHunterProfile) => {
    const id = saved[keyFor(p)];
    if (!id) return;
    setLoading(true);
    try {
      await hunterService.convertOpportunity(id);
      navigate('/prospectos');
    } catch (error: any) {
      setMessage(error?.response?.data?.message || 'No fue posible convertir.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout
      title="YouTube Lead Hunter"
      subtitle="Descubrimiento configurable con evidencia pública y API oficial de YouTube."
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6"
      >
        {mode === 'mock' && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
            Lead Hunter está en modo demostración. No son resultados obtenidos de YouTube.
          </div>
        )}
        <Card hover={false}>
          <p className="mb-3 text-xs text-dark-500">
            Los cuatro primeros criterios pertenecen al perfil objetivo fijo del MVP y están deshabilitados por diseño.
          </p>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm text-dark-300">
              Perfil objetivo
              <select
                disabled
                className="mt-1 w-full rounded-2xl border border-white/10 bg-dark-900 px-4 py-3 text-white"
              >
                <option>Vendedor</option>
              </select>
            </label>
            <label className="text-sm text-dark-300">
              Situación
              <select
                disabled
                className="mt-1 w-full rounded-2xl border border-white/10 bg-dark-900 px-4 py-3 text-white"
              >
                <option>Buscando empleo / nuevas oportunidades</option>
              </select>
            </label>
            <label className="text-sm text-dark-300">
              Área de afinidad
              <select
                disabled
                className="mt-1 w-full rounded-2xl border border-white/10 bg-dark-900 px-4 py-3 text-white"
              >
                <option>Nutrición y bienestar</option>
              </select>
            </label>
            <label className="text-sm text-dark-300">
              Afinidad comercial
              <select
                disabled
                className="mt-1 w-full rounded-2xl border border-white/10 bg-dark-900 px-4 py-3 text-white"
              >
                <option>Venta de productos</option>
              </select>
            </label>
            <label className="text-sm text-dark-300">
              País/Región
              <input
                value={regionCode}
                maxLength={2}
                onChange={e => setRegionCode(e.target.value.toUpperCase())}
                className="mt-1 w-full rounded-2xl border border-white/10 bg-dark-900 px-4 py-3 text-white"
              />
            </label>
            <label className="text-sm text-dark-300">
              Score mínimo
              <input
                type="number"
                min="0"
                max="100"
                value={minScore}
                onChange={e => setMinScore(Number(e.target.value))}
                className="mt-1 w-full rounded-2xl border border-white/10 bg-dark-900 px-4 py-3 text-white"
              />
            </label>
            <label className="text-sm text-dark-300">
              Cantidad
              <input
                type="number"
                min="1"
                max="20"
                value={quantity}
                onChange={e => setQuantity(Number(e.target.value))}
                className="mt-1 w-full rounded-2xl border border-white/10 bg-dark-900 px-4 py-3 text-white"
              />
            </label>
            <label className="text-sm text-dark-300">
              Actividad reciente (días)
              <input
                type="number"
                min="7"
                max="365"
                value={recentDays}
                onChange={e => setRecentDays(Number(e.target.value))}
                className="mt-1 w-full rounded-2xl border border-white/10 bg-dark-900 px-4 py-3 text-white"
              />
            </label>
          </div>
          <div className="mt-4 flex items-center gap-4">
            <Button onClick={() => void handleSearch()} loading={loading}>
              Buscar candidatos
            </Button>
            {quota && (
              <span className="text-sm text-dark-400">
                Búsquedas: tú {quota.userSearchCalls}/{quota.userSearchLimit} · proyecto{' '}
                {quota.projectSearchCalls}/{quota.projectSearchLimit}
              </span>
            )}
          </div>
          {message && <p className="mt-3 text-sm text-primary-200">{message}</p>}
          <p className="mt-2 text-xs text-dark-500">
            La clasificación expresa señales públicas observables; no afirma desempleo ni interés en
            una marca.
          </p>
        </Card>
        <div className="grid gap-4">
          {profiles.map(p => {
            const savedId = saved[keyFor(p)];
            return (
              <Card key={keyFor(p)} hover>
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold text-white">{p.fullName}</h3>
                    <Badge variant="secondary">YouTube</Badge>
                    <Badge variant="secondary">
                      {p.entityType || 'unknown'} · {Math.round((p.entityConfidence || 0) * 100)}%
                    </Badge>
                    <Badge variant={p.matchStatus === 'high_priority' ? 'danger' : 'warning'}>
                      {statusLabels[p.matchStatus || ''] || 'Sin clasificar'}
                    </Badge>
                  </div>
                  <p className="text-sm text-dark-400">{p.bio || 'Sin descripción pública'} </p>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                    {p.scores &&
                      scoreLabels.map(([key, label]) => (
                        <div key={key} className="rounded-xl bg-dark-900 p-3">
                          <div className="text-xs text-dark-400">{label}</div>
                          <div className="text-xl font-semibold text-white">
                            {p.scores?.[key]}/100
                          </div>
                        </div>
                      ))}
                  </div>
                  <p className="text-sm text-dark-300">
                    Ubicación pública: {p.publicLocation || 'No disponible'}
                    {p.locationSource ? ` · ${p.locationSource}` : ''}
                  </p>
                  <div className="grid gap-2 md:grid-cols-2">
                    {p.evidence
                      ?.filter(e => !e.possibleNegation)
                      .slice(0, 8)
                      .map((e, index) => (
                        <a
                          key={`${e.publicUrl}-${index}`}
                          href={e.publicUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-xl border border-white/10 p-3 text-sm hover:bg-white/5"
                        >
                          <span className="text-primary-200">
                            {categoryLabels[e.category]} · {e.type}
                          </span>
                          <p className="mt-1 text-dark-300">{e.context}</p>
                          <span className="text-xs text-dark-500">
                            {e.publishedAt
                              ? new Date(e.publishedAt).toLocaleDateString()
                              : 'Sin fecha pública'}{' '}
                            · confianza {Math.round(e.confidence * 100)}%
                          </span>
                        </a>
                      ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={p.channelUrl || p.profileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white"
                    >
                      Ver canal
                    </a>
                    {p.profileUrl !== p.channelUrl && (
                      <a
                        href={p.profileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white"
                      >
                        Ver evidencia
                      </a>
                    )}
                    {!savedId ? (
                      <Button variant="secondary" disabled={loading} onClick={() => void save(p)}>
                        Guardar oportunidad
                      </Button>
                    ) : (
                      <Button disabled={loading} onClick={() => void convert(p)}>
                        Convertir en prospecto
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
          {!profiles.length && (
            <Card hover={false}>
              <p className="text-dark-400">
                Configura los filtros y ejecuta manualmente la búsqueda. Ningún candidato se
                convierte automáticamente.
              </p>
            </Card>
          )}
        </div>
      </motion.div>
    </AppLayout>
  );
};
