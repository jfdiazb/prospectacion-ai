import { useMemo, useState } from 'react';
import { Badge, Button, Card } from '@components/shared';
import { launchService, type Launch, type LaunchParticipant } from '@services/launchService';

export const ParticipantPanel = ({
  launch,
  participants,
  refresh,
}: {
  launch: Launch;
  participants: LaunchParticipant[];
  refresh: () => Promise<void>;
}) => {
  const [filter, setFilter] = useState('');
  const [note, setNote] = useState('Evidencia registrada manualmente en CRM');
  const [message, setMessage] = useState('');
  const [manualLead, setManualLead] = useState('');
  const rows = useMemo(
    () =>
      participants.filter(
        item =>
          !filter ||
          [
            item.stage.status,
            item.registration.status,
            item.confirmation.status,
            item.attendance.status,
            item.entryChannel,
          ].includes(filter)
      ),
    [participants, filter]
  );
  const run = async (participant: LaunchParticipant, action: string) => {
    try {
      if (action === 'register' || action === 'confirm')
        await launchService.operation(launch._id, participant._id, action, note);
      else if (['attended', 'no_show'].includes(action))
        await launchService.attendance(
          launch._id,
          participant._id,
          action as 'attended' | 'no_show',
          note
        );
      else if (action === 'unknown')
        await launchService.attendance(
          launch._id,
          participant._id,
          'unknown',
          note,
          'Corrección manual desde CRM'
        );
      else {
        const dimension = action as 'registration' | 'confirmation';
        await launchService.correct(
          launch._id,
          participant._id,
          dimension,
          note,
          'Corrección manual desde CRM'
        );
      }
      setMessage('Hecho registrado con evidencia y auditoría.');
      await refresh();
    } catch (error: any) {
      setMessage(error?.response?.data?.message || 'La operación fue rechazada por el backend.');
    }
  };
  const addManual = async () => {
    try {
      await launchService.addManual(launch._id, manualLead, 'Inclusión manual revisada en CRM');
      setManualLead('');
      await refresh();
    } catch (error: any) {
      setMessage(error?.response?.data?.message || 'No fue posible añadir el lead.');
    }
  };
  return (
    <div className="space-y-4">
      <Card hover={false}>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-sm">
            Filtrar
            <select
              aria-label="Filtrar participantes"
              value={filter}
              onChange={event => setFilter(event.target.value)}
              className="mt-1 w-full rounded-xl bg-dark-800 p-2"
            >
              <option value="">Todos</option>
              {[
                'selected',
                'interested',
                'registered',
                'confirmed',
                'attended',
                'no_show',
                'unknown',
                'whatsapp',
                'instagram',
                'facebook',
              ].map(value => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Evidencia/nota
            <input
              aria-label="Evidencia"
              value={note}
              onChange={event => setNote(event.target.value)}
              className="mt-1 w-full rounded-xl bg-dark-800 p-2"
            />
          </label>
          <label className="text-sm">
            Añadir lead manualmente
            <div className="mt-1 flex gap-2">
              <input
                aria-label="ID del lead"
                value={manualLead}
                onChange={event => setManualLead(event.target.value)}
                className="min-w-0 grow rounded-xl bg-dark-800 p-2"
              />
              <Button size="sm" disabled={!manualLead} onClick={() => void addManual()}>
                Añadir
              </Button>
            </div>
          </label>
        </div>
        {message && <p className="mt-3 text-sm text-primary-300">{message}</p>}
        <p className="mt-2 text-xs text-amber-300">
          Registro, confirmación, asistencia y correcciones siempre pasan por validación y evidencia
          backend.
        </p>
      </Card>
      <div className="overflow-x-auto rounded-3xl border border-white/10">
        <table className="min-w-[1050px] w-full text-left text-sm">
          <thead className="bg-dark-900 text-dark-300">
            <tr>
              {[
                'Lead / seguridad',
                'Canal',
                'Participante',
                'Registro',
                'Confirmación',
                'Asistencia',
                'Calificación',
                'Próximo paso',
                'Operación',
              ].map(value => (
                <th key={value} className="p-3">
                  {value}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(item => (
              <tr key={item._id} className="border-t border-white/10 align-top">
                <td className="p-3">
                  <strong>{item.lead?.fullName || item.lead?.username || item.leadId}</strong>
                  <p className="text-xs text-dark-400">
                    {item.identitySafety?.generalOptOut ||
                    item.identitySafety?.blocked ||
                    item.lead?.status === 'rejected' ||
                    item.lead?.tags?.some(tag => ['opt_out', 'do_not_contact'].includes(tag))
                      ? '⚠ Opt-out / canal bloqueado'
                      : `Canal preferido: ${item.identitySafety?.preferredChannel || 'no definido'}`}
                  </p>
                </td>
                <td className="p-3">
                  {item.lead?.currentChannel || item.entryChannel || 'sin canal'}
                </td>
                <td className="p-3">
                  <Badge>{item.stage.status}</Badge>
                  <p className="mt-1 text-xs">{item.source}</p>
                </td>
                <td className="p-3">{item.registration.status}</td>
                <td className="p-3">{item.confirmation.status}</td>
                <td className="p-3">{item.attendance.status}</td>
                <td className="p-3">
                  {item.lead?.interestLevel || '—'} · {item.lead?.score ?? 0}
                  <p className="text-xs">{item.lead?.normalizedIntent || 'sin intención'}</p>
                </td>
                <td className="p-3">
                  {item.pendingAction?.kind || item.nextAction?.type || '—'}
                  {item.meeting && (
                    <p className="text-xs text-primary-300">Reunión: {item.meeting.status}</p>
                  )}
                </td>
                <td className="p-3">
                  <div className="flex max-w-xs flex-wrap gap-1">
                    <Button size="sm" onClick={() => void run(item, 'register')}>
                      Registrar
                    </Button>
                    <Button size="sm" onClick={() => void run(item, 'confirm')}>
                      Confirmar
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void run(item, 'attended')}
                    >
                      Asistió
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => void run(item, 'no_show')}>
                      No asistió
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => void run(item, 'unknown')}>
                      Corregir asistencia
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="p-6 text-dark-400">No hay participantes con este filtro.</p>}
      </div>
    </div>
  );
};
