import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Plus } from 'lucide-react';
import { AppLayout } from '@components/AppLayout';
import { Badge, Button, Card } from '@components/shared';
import { Modal } from '@components/advanced';
import { LaunchForm } from '@components/launches/LaunchForm';
import { SegmentPanel } from '@components/launches/SegmentPanel';
import { ParticipantPanel } from '@components/launches/ParticipantPanel';
import { ActionPanel } from '@components/launches/ActionPanel';
import {
  launchService,
  type Launch,
  type LaunchDetail,
  type LaunchInput,
  type LaunchStatus,
} from '@services/launchService';

const next: Partial<Record<LaunchStatus, LaunchStatus>> = {
  draft: 'scheduled',
  scheduled: 'prelaunch',
  prelaunch: 'live',
  live: 'followup',
  followup: 'completed',
};
const metricLabels: Array<[keyof LaunchDetail['metrics'], string]> = [
  ['selected', 'Seleccionados'],
  ['registered', 'Registrados'],
  ['confirmed', 'Confirmados'],
  ['attended', 'Asistieron'],
  ['notAttended', 'No asistieron'],
  ['unknown', 'Desconocido'],
  ['pendingActions', 'Acciones pendientes'],
  ['meetingRequested', 'Reuniones solicitadas'],
];
export const LaunchesPage = () => {
  const [launches, setLaunches] = useState<Launch[]>([]);
  const [detail, setDetail] = useState<LaunchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [tab, setTab] = useState('participants');
  const [message, setMessage] = useState('');
  const [filters, setFilters] = useState({ status: '', typeKey: '', from: '', to: '' });
  const load = async () => {
    setLoading(true);
    try {
      setLaunches(await launchService.list(filters));
    } catch (error: any) {
      setMessage(error?.response?.data?.message || 'No fue posible cargar Lanzamientos.');
    } finally {
      setLoading(false);
    }
  };
  const open = async (id: string) => {
    setLoading(true);
    try {
      setDetail(await launchService.detail(id));
    } catch (error: any) {
      setMessage(error?.response?.data?.message || 'No fue posible abrir el lanzamiento.');
    } finally {
      setLoading(false);
    }
  };
  const refresh = async () => {
    if (detail) setDetail(await launchService.detail(detail.launch._id));
    await load();
  };
  useEffect(() => {
    void load();
  }, []);
  const types = useMemo(() => [...new Set(launches.map(item => item.typeKey))], [launches]);
  const save = async (input: LaunchInput) => {
    try {
      const launch =
        modal === 'edit' && detail
          ? await launchService.update(detail.launch._id, input)
          : await launchService.create(input);
      setModal(null);
      setMessage('Lanzamiento guardado.');
      await load();
      await open(launch._id);
    } catch (error: any) {
      setMessage(error?.response?.data?.message || 'El backend rechazó los datos del lanzamiento.');
      throw error;
    }
  };
  const transition = async (status: LaunchStatus) => {
    if (!detail) return;
    try {
      await launchService.transition(detail.launch._id, status, 'Transición confirmada desde CRM');
      setMessage(`Estado actualizado a ${status}.`);
      await refresh();
    } catch (error: any) {
      setMessage(error?.response?.data?.message || 'Transición inválida o conflicto concurrente.');
    }
  };
  return (
    <AppLayout
      title="Lanzamientos"
      subtitle="Segmenta, registra hechos y revisa acciones comerciales con aprobación humana obligatoria."
    >
      <div className="space-y-6">
        {message && (
          <Card hover={false} className="border-primary-500/30">
            <p className="text-sm text-primary-200">{message}</p>
          </Card>
        )}
        {!detail ? (
          <>
            <Card hover={false}>
              <div className="flex flex-wrap items-end gap-3">
                <div className="mr-auto">
                  <h2 className="text-xl font-semibold">Vista general</h2>
                  <p className="text-sm text-dark-400">
                    Métricas derivadas exclusivamente de hechos registrados.
                  </p>
                </div>
                <Filter
                  label="Estado"
                  value={filters.status}
                  options={[
                    '',
                    'draft',
                    'scheduled',
                    'prelaunch',
                    'live',
                    'followup',
                    'completed',
                    'cancelled',
                  ]}
                  onChange={value => setFilters({ ...filters, status: value })}
                />
                <Filter
                  label="Tipo"
                  value={filters.typeKey}
                  options={['', ...types]}
                  onChange={value => setFilters({ ...filters, typeKey: value })}
                />
                <DateFilter
                  label="Desde"
                  value={filters.from}
                  onChange={value => setFilters({ ...filters, from: value })}
                />
                <DateFilter
                  label="Hasta"
                  value={filters.to}
                  onChange={value => setFilters({ ...filters, to: value })}
                />
                <Button variant="secondary" onClick={() => void load()}>
                  Filtrar
                </Button>
                <Button onClick={() => setModal('create')}>
                  <Plus className="mr-1 inline h-4 w-4" />
                  Crear
                </Button>
              </div>
            </Card>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {launches.map(launch => (
                <Card key={launch._id} onClick={() => void open(launch._id)}>
                  <div className="flex gap-2">
                    <Badge>{launch.status}</Badge>
                    <Badge variant="secondary">{launch.typeKey}</Badge>
                  </div>
                  <h3 className="mt-4 text-xl font-semibold">{launch.name}</h3>
                  <p className="mt-1 text-sm text-dark-400">
                    <CalendarDays className="mr-1 inline h-4 w-4" />
                    {launch.eventStartsAt
                      ? new Date(launch.eventStartsAt).toLocaleString()
                      : 'Sin fecha'}{' '}
                    · {launch.timezone}
                  </p>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                    {metricLabels.slice(0, 6).map(([key, label]) => (
                      <div key={key} className="rounded-xl bg-dark-800 p-2">
                        <strong className="block text-lg">{launch.metrics?.[key] ?? 0}</strong>
                        {label}
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-sm text-amber-300">
                    {launch.metrics?.pendingActions || 0} acciones pendientes
                  </p>
                </Card>
              ))}
            </div>
            {!loading && !launches.length && (
              <Card hover={false}>
                <p className="text-dark-400">No hay lanzamientos con estos filtros.</p>
              </Card>
            )}
          </>
        ) : (
          <>
            <Card hover={false}>
              <div className="flex flex-wrap items-start gap-3">
                <Button variant="secondary" onClick={() => setDetail(null)}>
                  ← Volver
                </Button>
                <div className="mr-auto">
                  <div className="flex gap-2">
                    <Badge>{detail.launch.status}</Badge>
                    <Badge variant="secondary">{detail.launch.typeKey}</Badge>
                  </div>
                  <h2 className="mt-2 text-2xl font-semibold">{detail.launch.name}</h2>
                  <p className="text-sm text-dark-400">
                    {detail.launch.eventStartsAt
                      ? new Date(detail.launch.eventStartsAt).toLocaleString()
                      : 'Sin fecha'}{' '}
                    · {detail.launch.timezone}
                  </p>
                </div>
                <Button variant="secondary" onClick={() => setModal('edit')}>
                  Editar configuración
                </Button>
                {next[detail.launch.status] && (
                  <Button onClick={() => void transition(next[detail.launch.status]!)}>
                    Avanzar a {next[detail.launch.status]}
                  </Button>
                )}
                {!['completed', 'cancelled'].includes(detail.launch.status) && (
                  <Button
                    variant="danger"
                    onClick={() =>
                      window.confirm('¿Cancelar este lanzamiento?') && void transition('cancelled')
                    }
                  >
                    Cancelar
                  </Button>
                )}
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
                {metricLabels.map(([key, label]) => (
                  <div key={key} className="rounded-xl bg-dark-800 p-3 text-center">
                    <strong className="block text-xl">{detail.metrics[key] ?? 0}</strong>
                    <span className="text-xs text-dark-400">{label}</span>
                  </div>
                ))}
              </div>
            </Card>
            <div className="flex flex-wrap gap-2">
              {[
                ['participants', 'Participantes y operación'],
                ['segment', 'Segmentación'],
                ['actions', 'Acciones y CRM'],
                ['audit', 'Auditoría'],
              ].map(([key, label]) => (
                <Button
                  key={key}
                  variant={tab === key ? 'primary' : 'secondary'}
                  onClick={() => setTab(key)}
                >
                  {label}
                </Button>
              ))}
            </div>
            {tab === 'participants' && (
              <ParticipantPanel
                launch={detail.launch}
                participants={detail.participants}
                refresh={refresh}
              />
            )}
            {tab === 'segment' && <SegmentPanel launch={detail.launch} refresh={refresh} />}
            {tab === 'actions' && <ActionPanel actions={detail.actions} refresh={refresh} />}
            {tab === 'audit' && <Audit events={detail.events} />}
          </>
        )}
      </div>
      <Modal
        isOpen={Boolean(modal)}
        onClose={() => setModal(null)}
        title={modal === 'edit' ? 'Editar lanzamiento' : 'Crear lanzamiento'}
        size="lg"
      >
        <LaunchForm
          launch={modal === 'edit' ? detail?.launch : undefined}
          onSave={save}
          onCancel={() => setModal(null)}
        />
      </Modal>
    </AppLayout>
  );
};
const Filter = ({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) => (
  <label className="text-xs text-dark-300">
    {label}
    <select
      aria-label={label}
      value={value}
      onChange={event => onChange(event.target.value)}
      className="mt-1 block rounded-xl bg-dark-800 p-2"
    >
      {options.map(option => (
        <option key={option} value={option}>
          {option || 'Todos'}
        </option>
      ))}
    </select>
  </label>
);
const DateFilter = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) => (
  <label className="text-xs text-dark-300">
    {label}
    <input
      aria-label={label}
      type="date"
      value={value}
      onChange={event => onChange(event.target.value)}
      className="mt-1 block rounded-xl bg-dark-800 p-2"
    />
  </label>
);
const Audit = ({ events }: { events: LaunchDetail['events'] }) => (
  <Card hover={false}>
    <h3 className="text-xl font-semibold">Historial auditable</h3>
    <div className="mt-4 max-h-[36rem] space-y-3 overflow-auto">
      {events.map(event => (
        <div key={event._id} className="rounded-xl border border-white/10 p-3">
          <div className="flex gap-2">
            <strong className="grow">{event.eventType}</strong>
            <span className="text-xs text-dark-400">
              {new Date(event.occurredAt).toLocaleString()}
            </span>
          </div>
          <p className="text-xs text-dark-400">
            Fuente: {event.source} · Actor: {event.actor}
            {event.evidence?.type ? ` · Evidencia: ${event.evidence.type}` : ''}
          </p>
          {event.evidence?.note && <p className="mt-1 text-sm">{event.evidence.note}</p>}
        </div>
      ))}
      {!events.length && <p className="text-dark-400">Sin eventos.</p>}
    </div>
  </Card>
);
