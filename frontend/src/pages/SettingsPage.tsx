import { motion } from 'framer-motion';
import { AppLayout } from '@components/AppLayout';
import { Button, Card } from '@components/shared';
import { useAuth } from '@context/AuthContext';
import { useEffect, useState } from 'react';
import { AlertTriangle, CalendarCheck, CheckCircle2, Clock, RefreshCw, Youtube } from 'lucide-react';
import { youtubeService, type OperationalDiagnostics, type YouTubeStatus } from '@services/youtubeService';
import { useNavigate } from 'react-router-dom';
import { commercialContextService, type CommercialContextSummary } from '@services/commercialContextService';
import { WhatsAppLiveDiagnostics } from '@components/settings/WhatsAppLiveDiagnostics';

export const SettingsPage = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [youtube, setYoutube] = useState<YouTubeStatus>({ connected: false });
  const [youtubeLoading, setYoutubeLoading] = useState(true);
  const [youtubeError, setYoutubeError] = useState('');
  const [youtubeHandle, setYoutubeHandle] = useState('@100mentalmente6');
  const [diagnostics, setDiagnostics] = useState<OperationalDiagnostics | null>(null);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(true);
  const [commercialContext, setCommercialContext] = useState<CommercialContextSummary | null>(null);

  const loadDiagnostics = async () => {
    setDiagnosticsLoading(true);
    try { setDiagnostics(await youtubeService.getDiagnostics()); }
    catch { setYoutubeError('No fue posible consultar el diagnóstico operativo.'); }
    finally { setDiagnosticsLoading(false); }
  };

  useEffect(() => {
    youtubeService.getStatus()
      .then(setYoutube)
      .catch(() => setYoutubeError('No fue posible consultar la conexión de YouTube.'))
      .finally(() => setYoutubeLoading(false));
    void loadDiagnostics();
    commercialContextService.active().then(setCommercialContext).catch(() => setYoutubeError('No fue posible consultar el contexto comercial activo.'));
  }, []);

  const connectYouTube = async () => {
    setYoutubeError(''); setYoutubeLoading(true);
    try { await youtubeService.connect(); } catch { setYoutubeError('No fue posible iniciar la autorización de YouTube.'); setYoutubeLoading(false); }
  };

  const disconnectYouTube = async () => {
    if (!window.confirm('¿Desconectar el canal de YouTube de ALMA?')) return;
    setYoutubeLoading(true);
    try { await youtubeService.disconnect(); setYoutube({ connected: false }); } catch { setYoutubeError('No fue posible desconectar YouTube.'); }
    finally { setYoutubeLoading(false); }
  };

  const selectYouTubeChannel = async () => {
    setYoutubeError(''); setYoutubeLoading(true);
    try {
      await youtubeService.selectChannel(youtubeHandle);
      setYoutube(await youtubeService.getStatus());
      await loadDiagnostics();
    } catch { setYoutubeError('No fue posible validar y seleccionar ese canal de YouTube.'); }
    finally { setYoutubeLoading(false); }
  };

  const youtubeRequiresReconnect = diagnostics?.alerts.some(alert => alert.code === 'youtube_reconnect_required') ?? false;

  return (
    <AppLayout title="Configuración" subtitle="Ajusta tu cuenta, notificaciones y preferencias del sistema.">
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
            <div className="space-y-6">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-dark-500">Cuenta</p>
                <h2 className="text-2xl font-semibold text-white">Información de usuario</h2>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-3xl bg-dark-900 p-5">
                  <p className="text-sm text-dark-400">Nombre</p>
                  <p className="mt-2 text-lg font-medium text-white">{user?.fullName || 'No disponible'}</p>
                </div>
                <div className="rounded-3xl bg-dark-900 p-5">
                  <p className="text-sm text-dark-400">Email</p>
                  <p className="mt-2 text-lg font-medium text-white">{user?.email || 'No disponible'}</p>
                </div>
              </div>

              <div className="space-y-4 rounded-3xl bg-dark-900 p-5">
                <div>
                  <p className="text-sm text-dark-400">Seguridad</p>
                  <p className="text-white">Actualiza tu contraseña y controla accesos.</p>
                </div>
                <Button variant="secondary" onClick={() => navigate('/profile')}>Cambiar contraseña</Button>
              </div>
            </div>
          </motion.div>
        </Card>

        <Card>
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
            <div className="space-y-6">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-dark-500">Preferencias</p>
                <h2 className="text-2xl font-semibold text-white">Notificaciones</h2>
              </div>

              <div className="space-y-4 rounded-3xl bg-dark-900 p-5">
                <div className="flex items-center justify-between rounded-2xl bg-dark-800 p-4">
                  <div>
                    <p className="font-medium text-white">Alertas de actividad</p>
                    <p className="text-sm text-dark-400">Consulta tareas pendientes dentro del panel superior y el CRM.</p>
                  </div>
                  <span className="rounded-full bg-primary-500 px-4 py-2 text-sm font-semibold text-white">Panel interno</span>
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-dark-800 p-4">
                  <div>
                    <p className="font-medium text-white">Resumen semanal</p>
                    <p className="text-sm text-dark-400">Recibe un informe de tus métricas cada semana.</p>
                  </div>
                  <span className="rounded-full bg-dark-700 px-4 py-2 text-sm text-dark-300">No activo</span>
                </div>
              </div>

              <Button variant="danger" onClick={logout} className="w-full">Cerrar sesión</Button>
            </div>
          </motion.div>
        </Card>

        <Card className="lg:col-span-2" hover={false}>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div><p className="text-sm uppercase tracking-[0.3em] text-dark-500">Contexto comercial activo</p><h2 className="text-2xl font-semibold text-white">{commercialContext?.brandName || 'Cargando…'}</h2><p className="mt-1 text-dark-400">{commercialContext?.commercialLines?.join(' · ') || 'Sin líneas configuradas'}</p></div>
            <div className="rounded-2xl bg-dark-900 px-5 py-3 text-sm"><p className="text-emerald-300">{commercialContext?.status || 'consultando'}</p><p className="text-dark-400">Versión {commercialContext?.version || '—'}</p></div>
          </div>
        </Card>

        {user?.role === 'admin' ? <WhatsAppLiveDiagnostics /> : (
          <Card className="lg:col-span-2" hover={false}>
            <div className="space-y-2">
              <p className="text-sm uppercase tracking-[0.3em] text-dark-500">Administración · solo lectura</p>
              <h2 className="text-2xl font-semibold text-white">Diagnóstico WhatsApp LIVE</h2>
              <p className="text-sm text-amber-300">Tu sesión está autenticada con rol {user?.role || 'sin rol'}, pero este diagnóstico requiere autorización administrativa.</p>
            </div>
          </Card>
        )}

        <Card className="lg:col-span-2" hover={false}>
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-4">
              <div className="rounded-2xl bg-red-500/15 p-3 text-red-400"><Youtube size={28} /></div>
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-dark-500">Canal principal</p>
                <h2 className="text-2xl font-semibold text-white">YouTube</h2>
                <p className="mt-1 text-dark-400">
                  {youtube.connected ? `Conectado${youtube.credential?.channelTitle ? ` a ${youtube.credential.channelTitle}` : ''}.` : 'Conecta tu canal para que ALMA procese comentarios INFO.'}
                </p>
                {youtube.credential && <div className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
                  <div><p className="text-dark-500">Nombre del canal monitorizado</p><p className="text-white">{youtube.credential.channelTitle || 'Sin nombre'}</p></div>
                  <div><p className="text-dark-500">Handle</p><p className="text-white">{youtube.credential.channelHandle || 'No disponible'}</p></div>
                  <div><p className="text-dark-500">Channel ID</p><p className="break-all font-mono text-white">{youtube.credential.channelId}</p></div>
                  {youtube.credential.authorizedChannelId !== youtube.credential.channelId && <p className="sm:col-span-3 text-amber-300">OAuth autorizado como {youtube.credential.authorizedChannelTitle || youtube.credential.authorizedChannelId}; el poller está dirigido al canal indicado arriba.</p>}
                </div>}
                {youtubeError && <p className="mt-2 text-sm text-red-400">{youtubeError}</p>}
                {youtube.connected && <div className="mt-4 flex max-w-xl flex-col gap-2 sm:flex-row">
                  <input aria-label="Handle del canal de YouTube" value={youtubeHandle} onChange={event => setYoutubeHandle(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-dark-700 bg-dark-800 px-4 py-2 text-white" placeholder="@canal" />
                  <Button variant="secondary" loading={youtubeLoading} onClick={selectYouTubeChannel}>Validar y monitorizar</Button>
                </div>}
              </div>
            </div>
            {youtube.connected
              ? <div className="flex flex-wrap gap-3">
                  {youtubeRequiresReconnect && <Button loading={youtubeLoading} onClick={connectYouTube}>Reconectar YouTube</Button>}
                  <Button variant="secondary" loading={youtubeLoading} onClick={disconnectYouTube}>Desconectar</Button>
                </div>
              : <Button loading={youtubeLoading} onClick={connectYouTube}>Conectar YouTube</Button>}
          </motion.div>
        </Card>

        <Card className="lg:col-span-2" hover={false}>
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-dark-500">Autodiagnóstico</p>
                <h2 className="text-2xl font-semibold text-white">Estado operativo de ALMA</h2>
                <p className="mt-1 text-dark-400">Señales seguras de YouTube, conversaciones y agenda, sin mostrar datos privados.</p>
              </div>
              <Button variant="secondary" loading={diagnosticsLoading} onClick={() => void loadDiagnostics()}>
                <RefreshCw size={17} /> Actualizar
              </Button>
            </div>

            {diagnostics && <>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-3xl bg-dark-900 p-5">
                  <div className="flex items-center gap-3 text-red-400"><Youtube size={21} /><span className="font-medium">YouTube</span></div>
                  <p className="mt-3 text-2xl font-semibold text-white">{diagnostics.youtube.connected ? 'Conectado' : 'Sin conexión'}</p>
                  <p className="mt-1 text-sm text-dark-400">Último sondeo: {formatDiagnosticDate(diagnostics.youtube.lastPolledAt)}</p>
                </div>
                <div className="rounded-3xl bg-dark-900 p-5">
                  <div className="flex items-center gap-3 text-primary-400"><RefreshCw size={21} /><span className="font-medium">Respuestas</span></div>
                  <p className="mt-3 text-2xl font-semibold text-white">{diagnostics.youtube.replies?.replies ?? 0} detectadas</p>
                  <p className="mt-1 text-sm text-dark-400">{diagnostics.youtube.replies?.activeThreads ?? 0} hilos activos · {diagnostics.youtube.replies?.processed ?? 0} nuevas</p>
                </div>
                <div className="rounded-3xl bg-dark-900 p-5">
                  <div className="flex items-center gap-3 text-emerald-400"><CalendarCheck size={21} /><span className="font-medium">Agenda</span></div>
                  <p className="mt-3 text-2xl font-semibold text-white">{diagnostics.calendly.futureScheduled} futuras</p>
                  <p className="mt-1 text-sm text-dark-400">{diagnostics.calendly.pendingBooking} pendientes · {diagnostics.calendly.failed} con error</p>
                </div>
              </div>

              <div className="rounded-3xl border border-dark-700 bg-dark-900 p-5">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="font-medium text-white">Comentarios principales</p>
                    <p className="text-sm text-dark-400">Último ciclo del poller principal; no incluye respuestas dentro de hilos existentes.</p>
                  </div>
                  <p className="text-xs text-dark-500">Corte: {formatDiagnosticDate(diagnostics.youtube.polling?.cutoffAt)}</p>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
                  <DiagnosticMetric label="Recibidos" value={diagnostics.youtube.polling?.topLevelComments ?? 0} />
                  <DiagnosticMetric label="Candidatos" value={diagnostics.youtube.polling?.afterCutoff ?? 0} />
                  <DiagnosticMetric label="Procesados" value={diagnostics.youtube.polling?.processed ?? 0} tone="success" />
                  <DiagnosticMetric label="Error de proceso" value={diagnostics.youtube.polling?.processing_failed ?? 0} tone="warning" />
                  <DiagnosticMetric label="Inválidos" value={diagnostics.youtube.polling?.invalid ?? 0} />
                  <DiagnosticMetric label="Canal propio" value={diagnostics.youtube.polling?.own_channel ?? 0} />
                  <DiagnosticMetric label="No elegibles" value={diagnostics.youtube.polling?.not_eligible ?? 0} tone="warning" />
                  <DiagnosticMetric label="Duplicados" value={diagnostics.youtube.polling?.duplicate ?? 0} />
                </div>
                <p className="mt-3 text-xs text-dark-500">
                  YouTube devolvió {diagnostics.youtube.polling?.receivedThreads ?? 0} hilos en este ciclo.
                </p>
              </div>

              <div className="grid gap-3">
                {diagnostics.alerts.map(alert => {
                  const warning = alert.severity === 'warning' || alert.severity === 'error';
                  const Icon = warning ? AlertTriangle : alert.severity === 'healthy' ? CheckCircle2 : Clock;
                  const tone = alert.severity === 'error' ? 'border-red-500/30 bg-red-500/10 text-red-300'
                    : alert.severity === 'warning' ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                      : alert.severity === 'healthy' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                        : 'border-primary-500/30 bg-primary-500/10 text-primary-300';
                  return <div key={alert.code} className={`flex items-start gap-3 rounded-2xl border p-4 ${tone}`}>
                    <Icon className="mt-0.5 shrink-0" size={19} /><p className="text-sm">{alert.message}</p>
                  </div>;
                })}
              </div>
              <p className="text-xs text-dark-500">Diagnóstico actualizado: {formatDiagnosticDate(diagnostics.checkedAt)}</p>
            </>}
          </motion.div>
        </Card>
      </div>
    </AppLayout>
  );
};

const formatDiagnosticDate = (value?: string) => value
  ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Bogota' }).format(new Date(value))
  : 'Sin datos';

const DiagnosticMetric = ({ label, value, tone = 'default' }: { label: string; value: number; tone?: 'default' | 'success' | 'warning' }) => {
  const valueTone = tone === 'success' ? 'text-emerald-300' : tone === 'warning' ? 'text-amber-300' : 'text-white';
  return <div className="rounded-2xl bg-dark-800 p-3">
    <p className={`text-xl font-semibold ${valueTone}`}>{value}</p>
    <p className="mt-1 text-xs text-dark-400">{label}</p>
  </div>;
};
