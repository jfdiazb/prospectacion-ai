import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Card } from '@components/shared';
import { crmService } from '@services/crmService';
import type { LaunchAction } from '@services/launchService';

export const ActionPanel = ({
  actions,
  refresh,
}: {
  actions: LaunchAction[];
  refresh: () => Promise<void>;
}) => {
  const [filter, setFilter] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const rows = useMemo(
    () =>
      actions.filter(
        action =>
          !filter ||
          (filter === 'invalidated'
            ? action.status === 'cancelled'
            : filter === 'executed'
              ? action.status === 'completed'
              : action.status === filter)
      ),
    [actions, filter]
  );
  const proposal = async (action: LaunchAction, operation: 'edit' | 'send' | 'discard') => {
    const item = action.proposalId;
    if (!item?.conversationId) return;
    try {
      if (operation === 'edit')
        await crmService.editProposal(item.conversationId, item._id, drafts[item._id] ?? item.text);
      if (operation === 'send') {
        if (!window.confirm('¿Aprobar y enviar manualmente esta propuesta por el canal indicado?'))
          return;
        await crmService.sendProposal(item.conversationId, item._id);
      }
      if (operation === 'discard') await crmService.discardProposal(item.conversationId, item._id);
      setMessage(
        operation === 'send' ? 'Envío manual solicitado por el operador.' : 'Propuesta actualizada.'
      );
      await refresh();
    } catch (error: any) {
      setMessage(
        error?.response?.data?.message || 'La propuesta es obsoleta, inválida o no pudo procesarse.'
      );
    }
  };
  const task = async (action: LaunchAction) => {
    if (!action.taskId) return;
    await crmService.setTaskStatus(action.taskId._id, 'completed');
    setMessage('Tarea completada.');
    await refresh();
  };
  return (
    <div className="space-y-4">
      <Card hover={false}>
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="mr-auto text-xl font-semibold">Acciones asistidas</h3>
          <label className="text-sm">
            Estado
            <select
              aria-label="Filtrar acciones"
              value={filter}
              onChange={event => setFilter(event.target.value)}
              className="ml-2 rounded-xl bg-dark-800 p-2"
            >
              <option value="">Todas</option>
              <option value="pending">Pendientes</option>
              <option value="completed">Completadas</option>
              <option value="failed">Fallidas</option>
              <option value="invalidated">Invalidadas</option>
            </select>
          </label>
          <Link className="rounded-lg bg-dark-700 px-4 py-2 text-sm" to="/crm">
            Abrir CRM completo
          </Link>
        </div>
        {message && <p className="mt-3 text-sm text-primary-300">{message}</p>}
        <p className="mt-2 text-xs text-amber-300">
          No existe envío automático. “Aprobar y enviar” siempre exige una acción y confirmación
          humana.
        </p>
      </Card>
      <div className="grid gap-4 xl:grid-cols-2">
        {rows.map(action => (
          <Card key={action._id} hover={false}>
            <div className="flex gap-2">
              <Badge
                variant={
                  action.status === 'completed'
                    ? 'success'
                    : action.status === 'cancelled' || action.status === 'failed'
                      ? 'danger'
                      : 'warning'
                }
              >
                {action.status}
              </Badge>
              <Badge>{action.priority}</Badge>
              <span className="ml-auto text-xs text-dark-400">
                {new Date(action.dueAt).toLocaleString()}
              </span>
            </div>
            <h4 className="mt-3 text-lg font-semibold">{action.kind}</h4>
            <p className="text-sm text-dark-300">
              {action.reason || action.triggerType || 'Sin razón registrada'}
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div>
                <dt className="text-dark-500">Canal</dt>
                <dd>{action.proposedChannel || 'Sin destinatario seguro'}</dd>
              </div>
              <div>
                <dt className="text-dark-500">Caduca</dt>
                <dd>
                  {action.expiresAt ? new Date(action.expiresAt).toLocaleString() : 'Sin fecha'}
                </dd>
              </div>
            </dl>
            {action.invalidationReason && (
              <p className="mt-3 rounded-xl bg-red-500/10 p-2 text-sm text-red-300">
                Invalidada: {action.invalidationReason}
              </p>
            )}
            {action.taskId && (
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-dark-800 p-3">
                <span className="grow text-sm">
                  Tarea: {action.taskId.title} · {action.taskId.status}
                </span>
                {action.taskId.status === 'pending' && (
                  <Button size="sm" variant="secondary" onClick={() => void task(action)}>
                    Completar
                  </Button>
                )}
              </div>
            )}
            {action.proposalId && (
              <div className="mt-3 space-y-2 rounded-xl border border-primary-500/20 p-3">
                <div className="flex gap-2">
                  <strong className="grow text-sm">Propuesta · {action.proposalId.platform}</strong>
                  <Badge
                    variant={action.proposalId.status === 'proposed' ? 'warning' : 'secondary'}
                  >
                    {action.proposalId.status}
                  </Badge>
                </div>
                <textarea
                  aria-label={`Propuesta ${action.kind}`}
                  disabled={action.proposalId.status !== 'proposed'}
                  value={drafts[action.proposalId._id] ?? action.proposalId.text}
                  onChange={event =>
                    setDrafts(current => ({
                      ...current,
                      [action.proposalId!._id]: event.target.value,
                    }))
                  }
                  className="min-h-24 w-full rounded-xl bg-dark-900 p-2 text-sm"
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={action.proposalId.status !== 'proposed'}
                    onClick={() => void proposal(action, 'edit')}
                  >
                    Guardar edición
                  </Button>
                  <Button
                    size="sm"
                    disabled={action.proposalId.status !== 'proposed'}
                    onClick={() => void proposal(action, 'send')}
                  >
                    Aprobar y enviar manualmente
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={action.proposalId.status !== 'proposed'}
                    onClick={() => void proposal(action, 'discard')}
                  >
                    Descartar
                  </Button>
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>
      {!rows.length && (
        <Card hover={false}>
          <p className="text-dark-400">No hay acciones con este filtro.</p>
        </Card>
      )}
    </div>
  );
};
