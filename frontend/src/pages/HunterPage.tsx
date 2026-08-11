import { motion } from 'framer-motion';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@components/AppLayout';
import { Card, Button, Badge } from '@components/shared';
import { hunterService } from '@services/hunterService';
import type { IHunterProfile } from '@types';

export const HunterPage = () => {
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState('marketing digital');
  const [type, setType] = useState<'channel' | 'video'>('channel');
  const [minFollowers, setMinFollowers] = useState(0);
  const [regionCode, setRegionCode] = useState('CO');
  const [profiles, setProfiles] = useState<IHunterProfile[]>([]);
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [quota, setQuota] = useState<{ projectSearchCalls: number; projectSearchLimit: number; userSearchCalls: number; userSearchLimit: number }>();

  const keyFor = (profile: IHunterProfile) => `${profile.youtubeChannelId}:${profile.youtubeVideoId || ''}`;
  const handleSearch = async () => {
    setLoading(true); setMessage('');
    try {
      const response = await hunterService.searchProfiles({ keyword, type, minFollowers, regionCode });
      setProfiles(response.data?.results || []); setQuota(response.data?.quota);
      if (response.data?.cached) setMessage('Resultados recuperados de caché; esta consulta no consumió una nueva búsqueda.');
    } catch (error: any) { setMessage(error?.response?.data?.message || 'No fue posible buscar en YouTube.'); }
    finally { setLoading(false); }
  };
  const save = async (profile: IHunterProfile) => { setLoading(true); try { const opportunity = await hunterService.saveOpportunity(profile); setSaved(current => ({ ...current, [keyFor(profile)]: opportunity._id })); setMessage('Oportunidad guardada. Ya puedes convertirla en lead.'); } catch (error: any) { setMessage(error?.response?.data?.message || 'No fue posible guardar la oportunidad.'); } finally { setLoading(false); } };
  const convert = async (profile: IHunterProfile) => { const id = saved[keyFor(profile)]; if (!id) return; setLoading(true); try { await hunterService.convertOpportunity(id); setMessage('Oportunidad convertida en lead del CRM.'); navigate('/prospectos'); } catch (error: any) { setMessage(error?.response?.data?.message || 'No fue posible convertir la oportunidad.'); } finally { setLoading(false); } };

  return <AppLayout title="YouTube Lead Hunter" subtitle="Busca con la API oficial, guarda oportunidades y conviértelas en leads.">
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <Card hover={false}><div className="grid gap-3 lg:grid-cols-5"><input value={keyword} onChange={event => setKeyword(event.target.value)} placeholder="Palabra clave" className="rounded-2xl border border-white/10 bg-dark-900 px-4 py-3 text-white" /><select value={type} onChange={event => setType(event.target.value as 'channel' | 'video')} className="rounded-2xl border border-white/10 bg-dark-900 px-4 py-3 text-white"><option value="channel">Canales</option><option value="video">Videos</option></select><input type="number" min="0" value={minFollowers} onChange={event => setMinFollowers(Number(event.target.value))} placeholder="Seguidores mínimos" className="rounded-2xl border border-white/10 bg-dark-900 px-4 py-3 text-white" /><input value={regionCode} maxLength={2} onChange={event => setRegionCode(event.target.value.toUpperCase())} placeholder="País: CO" className="rounded-2xl border border-white/10 bg-dark-900 px-4 py-3 text-white" /><Button onClick={() => void handleSearch()} loading={loading}>Buscar en YouTube</Button></div>{quota && <p className="mt-4 text-sm text-dark-400">Búsquedas: tú {quota.userSearchCalls}/{quota.userSearchLimit} · proyecto {quota.projectSearchCalls}/{quota.projectSearchLimit}</p>}{message && <p className="mt-3 text-sm text-primary-200">{message}</p>}</Card>
      <div className="grid gap-4">{profiles.map(profile => { const savedId = saved[keyFor(profile)]; return <Card key={keyFor(profile)} hover><div className="flex flex-col gap-4 md:flex-row md:items-center"><div className="flex-1"><div className="flex flex-wrap gap-2"><h3 className="font-semibold text-white">{profile.fullName}</h3><Badge variant="secondary">{profile.kind}</Badge><Badge variant={profile.interestLevel === 'hot' ? 'danger' : 'warning'}>Score {profile.score}</Badge></div><p className="mt-2 line-clamp-2 text-sm text-dark-400">{profile.bio || 'Sin descripción pública'}</p><p className="mt-2 text-sm text-dark-300">{profile.followers || 0} suscriptores · {profile.views || 0} visualizaciones del canal</p></div><div className="flex flex-wrap gap-2"><a href={profile.profileUrl} target="_blank" rel="noreferrer" className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white hover:bg-white/5">Ver en YouTube</a>{!savedId ? <Button variant="secondary" disabled={loading} onClick={() => void save(profile)}>Guardar oportunidad</Button> : <Button disabled={loading} onClick={() => void convert(profile)}>Convertir en lead</Button>}</div></div></Card>; })}{!profiles.length && <Card hover={false}><p className="text-dark-400">Usa los filtros para buscar canales o videos. Las búsquedas solo se ejecutan al pulsar el botón.</p></Card>}</div>
    </motion.div>
  </AppLayout>;
};
