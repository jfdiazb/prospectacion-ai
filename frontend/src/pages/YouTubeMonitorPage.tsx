import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Activity, AlertTriangle, CheckCircle2, Gauge, RefreshCw, Send, ShieldCheck, Youtube } from 'lucide-react';
import { AppLayout } from '@components/AppLayout';
import { Button, Card } from '@components/shared';
import { youtubeService, type YouTubeMonitor } from '@services/youtubeService';

export const YouTubeMonitorPage = () => {
  const [monitor, setMonitor] = useState<YouTubeMonitor | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = async () => { setLoading(true); setError(''); try { setMonitor(await youtubeService.getMonitor()); } catch { setError('No fue posible consultar YouTube Monitor.'); } finally { setLoading(false); } };
  const retry = async (id: string) => { setLoading(true); setError(''); try { await youtubeService.retryMessage(id); await load(); } catch { setError('El reintento fue rechazado por seguridad o volvió a fallar.'); setLoading(false); } };
  useEffect(() => { void load(); }, []);

  return <AppLayout title="YouTube Monitor" subtitle="Cobertura, entregas y salud operativa de ALMA.">
    <div className="space-y-6">
      <div className="flex justify-end"><Button variant="secondary" loading={loading} onClick={() => void load()}><RefreshCw size={17} /> Actualizar</Button></div>
      {error && <Card hover={false}><p className="text-red-400">{error}</p></Card>}
      {monitor && <>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <Metric icon={Youtube} label="Hilos activos" value={monitor.activeThreadCount} detail={`${monitor.config.activeDays} días de actividad`} />
          <Metric icon={ShieldCheck} label="Con cobertura" value={monitor.monitoredThreadCount} detail={monitor.uncoveredThreadCount > 0 ? `RotaciÃ³n completa: hasta ${monitor.maxCoverageDelayMinutes ?? '-'} min` : `Capacidad actual: ${monitor.config.maxThreads}`} />
          <Metric icon={Activity} label="Último ciclo" value={monitor.lastReplySummary?.replies ?? 0} detail={`${monitor.lastReplySummary?.processed ?? 0} respuestas nuevas`} />
          <Metric icon={Send} label="Entregas de hoy" value={monitor.delivery.sent} detail={`${monitor.delivery.failed} fallidas · ${monitor.delivery.pending} pendientes`} />
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <Card hover={false}><div className="flex items-center gap-3 text-primary-300"><Gauge size={21} /><span>Cuota estimada</span></div><p className="mt-3 text-3xl font-semibold text-white">{monitor.quota.estimatedUnitsToday} / {monitor.quota.dailyLimit}</p><div className="mt-3 h-2 overflow-hidden rounded-full bg-dark-900"><div className="h-full rounded-full bg-primary-500" style={{ width: `${monitor.quota.estimatedPercent}%` }} /></div><p className="mt-2 text-xs text-dark-400">{monitor.quota.note}</p></Card>
          <Card hover={false}><p className="text-sm text-dark-400">Último comentario procesado</p><p className="mt-2 text-lg font-semibold text-white">{formatDate(monitor.lastProcessedCommentAt)}</p><p className="mt-4 text-sm text-dark-400">Conversaciones esperando a ALMA</p><p className={`mt-1 text-2xl font-semibold ${monitor.unanswered.count ? 'text-red-300' : 'text-emerald-300'}`}>{monitor.unanswered.count}</p></Card>
        </div>

        <Card hover={false}><div className="space-y-3">{monitor.alerts.map(alert => { const bad = alert.severity !== 'healthy'; const Icon = bad ? AlertTriangle : CheckCircle2; return <div key={alert.code} className={`flex items-center gap-3 rounded-2xl border p-4 ${bad ? 'border-amber-500/30 bg-amber-500/10 text-amber-300' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'}`}><Icon size={19} /><span className="text-sm">{alert.message}</span></div>; })}</div></Card>

        {monitor.retryableFailures.length > 0 && <Card hover={false}>
          <div className="mb-4"><h2 className="text-xl font-semibold text-white">Fallos recientes</h2><p className="text-sm text-dark-400">Sin mensajes ni identificadores externos. Los timeouts no se reintentan para evitar duplicados.</p></div>
          <div className="space-y-3">{monitor.retryableFailures.map(failure => <div key={failure.id} className="flex flex-col gap-3 rounded-2xl bg-dark-900 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium text-white">{failure.category.toUpperCase()} · {failure.code}</p><p className="text-sm text-dark-400">{formatDate(failure.failedAt)} · {failure.retryCount}/3 reintentos</p></div><Button variant="secondary" disabled={!failure.canRetry || loading} onClick={() => void retry(failure.id)}><RefreshCw size={16} /> Reintentar</Button></div>)}</div>
        </Card>}

        <Card hover={false}>
          <div className="mb-5"><h2 className="text-xl font-semibold text-white">Conversaciones vigiladas</h2><p className="text-sm text-dark-400">Ordenadas por actividad reciente; no se muestran mensajes ni IDs externos.</p></div>
          <div className="space-y-3">
            {monitor.threads.length === 0 && <p className="rounded-2xl bg-dark-900 p-5 text-dark-400">Aún no hay hilos activos.</p>}
            {monitor.threads.map(thread => <motion.div key={thread.position} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="grid gap-3 rounded-2xl bg-dark-900 p-4 sm:grid-cols-[1fr_auto_auto] sm:items-center"><div><p className="font-medium text-white">{thread.lead?.name || 'Prospecto de YouTube'}</p><p className="text-sm text-dark-400">Última actividad: {formatDate(thread.lastActivityAt)}</p></div><span className="text-sm text-dark-300">Score {thread.lead?.score ?? 0} · {thread.lead?.interestLevel || 'sin calificar'}</span><span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${thread.monitored ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>{thread.monitored ? 'Vigilado' : 'En espera'}</span></motion.div>)}
          </div>
        </Card>
      </>}
    </div>
  </AppLayout>;
};

const Metric = ({ icon: Icon, label, value, detail }: { icon: typeof Youtube; label: string; value: number; detail: string }) => <Card hover={false}><div className="flex items-center gap-3 text-primary-300"><Icon size={21} /><span>{label}</span></div><p className="mt-3 text-3xl font-semibold text-white">{value}</p><p className="mt-1 text-sm text-dark-400">{detail}</p></Card>;
const formatDate = (value?: string) => value ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Bogota' }).format(new Date(value)) : 'Sin datos';
