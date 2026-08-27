import { useEffect, useState } from 'react';
import { AppLayout } from '@components/AppLayout';
import { Button, Card } from '@components/shared';
import { crmService, type CrmActivity, type CrmConversation, type CrmMeeting, type CrmTask, type DuplicateCandidate } from '@services/crmService';

export const CrmPage = () => {
  const [activities, setActivities] = useState<CrmActivity[]>([]);
  const [meetings, setMeetings] = useState<CrmMeeting[]>([]);
  const [conversations, setConversations] = useState<CrmConversation[]>([]);
  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [changingControl, setChangingControl] = useState<string | null>(null);
  const [changingTask, setChangingTask] = useState<string | null>(null);
  const [changingMeeting, setChangingMeeting] = useState<string | null>(null);
  const [expandedConversation, setExpandedConversation] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [proposalDrafts, setProposalDrafts] = useState<Record<string, string>>({});
  const [duplicateCandidates, setDuplicateCandidates] = useState<DuplicateCandidate[]>([]);

  const changeTaskStatus = async (taskId: string, status: 'pending' | 'completed') => {
    setChangingTask(taskId);
    try {
      const updated = await crmService.setTaskStatus(taskId, status);
      setTasks(current => current.map(item => item._id === taskId ? updated : item));
    } finally { setChangingTask(null); }
  };

  const changeControl = async (conversationId: string, action: 'take' | 'resume') => {
    setChangingControl(conversationId);
    try {
      const updated = await crmService.setConversationControl(conversationId, action);
      setConversations(current => current.map(item => item._id === conversationId ? updated : item));
    } finally { setChangingControl(null); }
  };

  const runMeetingAction = async (meetingId: string, action: 'retry' | 'cancel' | 'reschedule' | 'complete' | 'no-show' | 'technical-failure') => {
    if (action === 'cancel' && !window.confirm('¿Cancelar esta reunión también en el proveedor cuando corresponda?')) return;
    if (action === 'no-show' && !window.confirm('¿Confirmas manualmente que la reunión fue no-show? ALMA nunca lo infiere solo por la hora.')) return;
    if (action === 'technical-failure' && !window.confirm('¿Registrar un fallo técnico confirmado para esta reunión?')) return;
    setChangingMeeting(meetingId);
    try { const updated = await crmService.meetingAction(meetingId, action); setMeetings(current => current.map(item => item._id === meetingId ? { ...item, ...updated } : item)); }
    finally { setChangingMeeting(null); }
  };

  const sendHumanMessage = async (conversationId: string) => {
    const text = drafts[conversationId]?.trim();
    if (!text) return;
    setChangingControl(conversationId);
    try {
      const updated = await crmService.sendHumanMessage(conversationId, text);
      setConversations(current => current.map(item => item._id === conversationId ? { ...item, messages: updated.messages, lastMessage: updated.lastMessage } : item));
      setDrafts(current => ({ ...current, [conversationId]: '' }));
    } finally { setChangingControl(null); }
  };

  const saveProposal = async (conversation: CrmConversation) => {
    if (!conversation.proposedResponse) return;
    setChangingControl(conversation._id);
    try {
      const proposal = await crmService.editProposal(conversation._id, conversation.proposedResponse._id, proposalDrafts[conversation._id] ?? conversation.proposedResponse.text);
      setConversations(current => current.map(item => item._id === conversation._id ? { ...item, proposedResponse: proposal } : item));
    } finally { setChangingControl(null); }
  };

  const sendProposal = async (conversation: CrmConversation) => {
    if (!conversation.proposedResponse) return;
    setChangingControl(conversation._id);
    try {
      const proposal = await crmService.sendProposal(conversation._id, conversation.proposedResponse._id);
      setConversations(current => current.map(item => item._id === conversation._id ? { ...item, proposedResponse: proposal } : item));
    } finally { setChangingControl(null); }
  };

  const discardProposal = async (conversation: CrmConversation) => {
    if (!conversation.proposedResponse || !window.confirm('¿Descartar esta propuesta sin enviar ningún mensaje?')) return;
    setChangingControl(conversation._id);
    try {
      const proposal = await crmService.discardProposal(conversation._id, conversation.proposedResponse._id);
      setConversations(current => current.map(item => item._id === conversation._id ? { ...item, proposedResponse: proposal } : item));
    } finally { setChangingControl(null); }
  };

  useEffect(() => {
    Promise.all([crmService.activities(), crmService.meetings(), crmService.conversations(), crmService.tasks(), crmService.duplicateCandidates()])
      .then(([activityData, meetingData, conversationData, taskData, candidateData]) => {
        setActivities(activityData);
        setMeetings(meetingData);
        setConversations(conversationData);
        setDuplicateCandidates(candidateData);
        // Ordenar tareas: prioridad (high, medium, low) y luego por dueDate asc
        const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
        const sortedTasks = (taskData || []).slice().sort((a, b) => {
          const pa = priorityOrder[a.priority || 'medium'];
          const pb = priorityOrder[b.priority || 'medium'];
          if (pa !== pb) return pa - pb;
          const da = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
          const db = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
          return da - db;
        });
        setTasks(sortedTasks);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppLayout title="CRM" subtitle="Actividad real de captación, seguimiento y reuniones de ALMA.">
      <div className="grid gap-6 xl:grid-cols-3">
        <Card>
          <h2 className="mb-4 text-2xl font-semibold text-white">Posibles duplicados</h2>
          <div className="space-y-3">
            {duplicateCandidates.map(candidate => <div key={candidate._id} className="rounded-2xl bg-dark-900 p-4">
              <p className="text-sm text-white">{candidate.leadAId.username || 'Lead'} ({candidate.leadAId.platform}) ↔ {candidate.leadBId.username || 'Lead'} ({candidate.leadBId.platform})</p>
              <p className="text-xs text-dark-500">Señales: {candidate.signals.join(', ')}. ALMA no los fusionó.</p>
              <div className="mt-2 flex gap-2"><Button size="sm" onClick={() => void crmService.resolveDuplicate(candidate._id, 'confirm').then(() => setDuplicateCandidates(current => current.filter(item => item._id !== candidate._id)))}>Confirmar vínculo</Button><Button size="sm" variant="secondary" onClick={() => void crmService.resolveDuplicate(candidate._id, 'reject').then(() => setDuplicateCandidates(current => current.filter(item => item._id !== candidate._id)))}>No son la misma persona</Button></div>
            </div>)}
            {!loading && !duplicateCandidates.length && <p className="text-dark-400">No hay coincidencias pendientes de revisión.</p>}
          </div>
        </Card>
        <Card>
          <h2 className="mb-4 text-2xl font-semibold text-white">Actividad reciente</h2>
          <div className="space-y-3">
            {activities.slice(0, 12).map(activity => (
              <div key={activity._id} className="rounded-2xl bg-dark-900 p-4">
                <p className="font-medium text-white">{activity.leadId?.fullName || activity.leadId?.username || 'Prospecto'}</p>
                <p className="text-sm text-dark-400">{activity.description}</p>
              </div>
            ))}
            {!loading && !activities.length && <p className="text-dark-400">Aún no hay actividad registrada.</p>}
          </div>
        </Card>
        <Card>
          <h2 className="mb-4 text-2xl font-semibold text-white">Reuniones</h2>
          <div className="space-y-3">
            {meetings.map(meeting => (
              <div key={meeting._id} className="rounded-2xl bg-dark-900 p-4">
                <p className="font-medium text-white">{meeting.leadId?.fullName || meeting.leadId?.username || 'Prospecto'}</p>
                <p className="text-sm text-dark-400">{meeting.topic || 'Reunión de descubrimiento'} · {meeting.provider || 'zoom'} · {meeting.status}</p>
                <p className="text-xs text-dark-500">{meeting.originChannel || 'canal no registrado'} · {meeting.timezone || 'zona pendiente'} · {meeting.durationMinutes || 30} min</p>
                {(meeting.scheduledAt || meeting.scheduledFor) && <p className="text-xs text-dark-500">{new Date(meeting.scheduledAt || meeting.scheduledFor!).toLocaleString()}</p>}
                {meeting.externalMeetingId && <p className="text-xs text-dark-500">Zoom: {meeting.externalMeetingId}</p>}
                {meeting.errorMessage && <p className="text-xs text-red-300">{meeting.errorCode || 'error'} · {meeting.errorMessage}</p>}
                {meeting.outcome?.type && <p className="text-xs text-amber-300">Resultado: {meeting.outcome.type} · {meeting.outcome.actor || 'unknown'}{meeting.outcome.reason ? ` · ${meeting.outcome.reason}` : ''}</p>}
                {meeting.joinUrl && ['confirmed', 'scheduled'].includes(meeting.status) && (
                  <a className="mt-2 inline-block text-sm font-medium text-primary-400 hover:text-primary-300" href={meeting.joinUrl} target="_blank" rel="noreferrer">Abrir acceso privado</a>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  {meeting.status === 'failed' && <Button size="sm" loading={changingMeeting === meeting._id} onClick={() => void runMeetingAction(meeting._id, 'retry')}>Reintentar</Button>}
                  {['confirmed', 'scheduled', 'pending_configuration'].includes(meeting.status) && <Button size="sm" variant="secondary" loading={changingMeeting === meeting._id} onClick={() => void runMeetingAction(meeting._id, 'reschedule')}>Reprogramar</Button>}
                  {['confirmed', 'scheduled'].includes(meeting.status) && <Button size="sm" variant="secondary" loading={changingMeeting === meeting._id} onClick={() => void runMeetingAction(meeting._id, 'complete')}>Completar</Button>}
                  {['confirmed', 'scheduled', 'pending_review'].includes(meeting.status) && <Button size="sm" variant="secondary" loading={changingMeeting === meeting._id} onClick={() => void runMeetingAction(meeting._id, 'no-show')}>Registrar no-show</Button>}
                  {['confirmed', 'scheduled', 'pending_review'].includes(meeting.status) && <Button size="sm" variant="secondary" loading={changingMeeting === meeting._id} onClick={() => void runMeetingAction(meeting._id, 'technical-failure')}>Fallo técnico</Button>}
                  {meeting.status === 'pending_review' && <Button size="sm" loading={changingMeeting === meeting._id} onClick={() => void runMeetingAction(meeting._id, 'complete')}>Confirmar asistencia</Button>}
                  {!['cancelled', 'completed'].includes(meeting.status) && <Button size="sm" variant="danger" loading={changingMeeting === meeting._id} onClick={() => void runMeetingAction(meeting._id, 'cancel')}>Cancelar</Button>}
                </div>
                {meeting.lifecycleHistory?.length ? <details className="mt-2 text-xs text-dark-400"><summary>Historial</summary>{meeting.lifecycleHistory.map((entry, index) => <p key={`${entry.at}-${index}`}>{new Date(entry.at).toLocaleString()} · {entry.status}{entry.reason ? ` · ${entry.reason}` : ''}</p>)}</details> : null}
              </div>
            ))}
            {!loading && !meetings.length && <p className="text-dark-400">Aún no hay reuniones registradas.</p>}
          </div>
        </Card>
        <Card>
          <h2 className="mb-4 text-2xl font-semibold text-white">Tareas CRM</h2>
          <div className="space-y-3">
            {tasks.map(task => (
              <div key={task._id} className="rounded-2xl bg-dark-900 p-4">
                <p className="font-medium text-white">{task.title}</p>
                <p className="text-sm text-dark-400">{task.description}</p>
                <p className="text-xs text-dark-500">{task.type} · {task.priority} · {task.status} {task.dueDate ? `· ${new Date(task.dueDate).toLocaleString()}` : ''}</p>
                {task.status !== 'cancelled' && <div className="mt-3">
                  <Button size="sm" variant="secondary" loading={changingTask === task._id} onClick={() => void changeTaskStatus(task._id, task.status === 'completed' ? 'pending' : 'completed')}>
                    {task.status === 'completed' ? 'Reabrir tarea' : 'Marcar terminada'}
                  </Button>
                </div>}
              </div>
            ))}
            {!loading && !tasks.length && <p className="text-dark-400">Aún no hay tareas asignadas.</p>}
          </div>
        </Card>
        <Card>
          <h2 className="mb-4 text-2xl font-semibold text-white">Conversaciones</h2>
          <div className="space-y-3">
            {conversations.slice(0, 8).map(conversation => {
              const lastMessage = conversation.messages?.[conversation.messages.length - 1];
              const isExpanded = expandedConversation === conversation._id;
              return (
                <div key={conversation._id} className="rounded-2xl bg-dark-900 p-4">
                  <p className="font-medium text-white">{conversation.leadId?.fullName || conversation.leadId?.username || 'Prospecto'}</p>
                  <p className="text-sm text-dark-400">Estado: {conversation.status}</p>
                  <p className="text-xs text-dark-500">Origen: {conversation.leadId?.origin?.source || conversation.leadId?.source || 'Sin origen'} · Canal actual: {lastMessage?.platform || conversation.leadId?.currentChannel || conversation.leadId?.platform || 'Sin canal'}</p>
                  {conversation.identityContext && <div className="mt-2 rounded-xl border border-white/10 p-2 text-xs text-dark-400">
                    <p>Contacto confirmado · preferido: {conversation.identityContext.preferredChannel || 'sin preferencia'}{conversation.identityContext.generalOptOut ? ' · opt-out general' : ''}</p>
                    <div>{conversation.identityContext.identities.map(identity => <div key={identity._id} className="mt-1 flex flex-wrap items-center gap-2"><span>{identity.platform}</span><select className="rounded bg-dark-800 p-1" value={identity.consentStatus} onChange={event => void crmService.setIdentityConsent(identity._id, event.target.value as 'unknown' | 'consented' | 'opted_out' | 'blocked').then(() => setConversations(current => current.map(item => item.identityContext?.contactId === conversation.identityContext!.contactId ? { ...item, identityContext: { ...item.identityContext!, identities: item.identityContext!.identities.map(entry => entry._id === identity._id ? { ...entry, consentStatus: event.target.value } : entry) } } : item)))}><option value="unknown">Sin confirmar</option><option value="consented">Consentido</option><option value="opted_out">Opt-out</option><option value="blocked">Bloqueado</option></select><button className="text-red-300" onClick={() => window.confirm('¿Deshacer este vínculo sin eliminar ningún lead?') && void crmService.unlinkIdentity(identity._id)}>Desvincular</button></div>)}</div>
                    <select className="mt-2 rounded bg-dark-800 p-1" value={conversation.identityContext.preferredChannel || ''} onChange={event => void crmService.setPreferredChannel(conversation.identityContext!.contactId, event.target.value || null).then(() => setConversations(current => current.map(item => item.identityContext?.contactId === conversation.identityContext!.contactId ? { ...item, identityContext: { ...item.identityContext!, preferredChannel: event.target.value || undefined } } : item)))}><option value="">Sin preferencia</option>{conversation.identityContext.identities.map(identity => <option key={identity._id} value={identity.platform}>{identity.platform}</option>)}</select>
                    <button className={`ml-2 rounded px-2 py-1 ${conversation.identityContext.generalOptOut ? 'bg-emerald-900 text-emerald-200' : 'bg-red-950 text-red-200'}`} onClick={() => void crmService.setGeneralOptOut(conversation.identityContext!.contactId, !conversation.identityContext!.generalOptOut).then(() => setConversations(current => current.map(item => item.identityContext?.contactId === conversation.identityContext!.contactId ? { ...item, identityContext: { ...item.identityContext!, generalOptOut: !item.identityContext!.generalOptOut } } : item)))}>{conversation.identityContext.generalOptOut ? 'Rehabilitar contacto' : 'Bloquear todo seguimiento'}</button>
                  </div>}
                  {conversation.leadId?.followUp && <p className="text-xs text-dark-500">Seguimientos: {conversation.leadId.followUp.attempts || 0} · {conversation.leadId.followUp.lastDecision || 'pendiente'}{conversation.leadId.followUp.lastReason ? ` · ${conversation.leadId.followUp.lastReason}` : ''}{conversation.leadId.nextFollowUp ? ` · próximo ${new Date(conversation.leadId.nextFollowUp).toLocaleString()}` : ''}</p>}
                  {conversation.leadId?.reactivation && <p className="text-xs text-dark-500">Reactivaciones: {conversation.leadId.reactivation.attempts || 0} · {conversation.leadId.reactivation.lastDecision || 'sin intento'}{conversation.leadId.reactivation.nextEligibleAt ? ` · elegible ${new Date(conversation.leadId.reactivation.nextEligibleAt).toLocaleString()}` : ''}</p>}
                  {conversation.latestQualification && <p className="text-xs text-dark-500">Calificación: {conversation.latestQualification.previous?.score ?? 0} → {conversation.latestQualification.current?.score ?? conversation.leadId?.score ?? 0} ({conversation.latestQualification.current?.interestLevel || conversation.leadId?.interestLevel}) · {conversation.latestQualification.reasons?.join(', ') || 'sin cambio'} · {conversation.latestQualification.evaluatorVersion}</p>}
                  <p className={`mt-1 text-xs font-semibold ${conversation.controlMode === 'handoff_requested' ? 'text-amber-300' : conversation.controlMode === 'human_controlled' ? 'text-blue-300' : 'text-emerald-300'}`}>
                    {conversation.controlMode === 'handoff_requested' ? 'ALMA solicita intervención' : conversation.controlMode === 'human_controlled' ? 'Control humano' : 'ALMA activa'}
                  </p>
                  {lastMessage && (
                    <p className="text-sm text-dark-400 truncate">{lastMessage.sender === 'ai' ? 'ALMA:' : lastMessage.sender === 'lead' ? 'Lead:' : 'Usuario:'} {lastMessage.text}</p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setExpandedConversation(isExpanded ? null : conversation._id)}>
                      {isExpanded ? 'Cerrar conversación' : 'Abrir conversación'}
                    </Button>
                    {(!conversation.controlMode || conversation.controlMode === 'automated') && <Button size="sm" variant="secondary" loading={changingControl === conversation._id} onClick={() => void changeControl(conversation._id, 'take')}>Pausar ALMA</Button>}
                    {conversation.controlMode === 'handoff_requested' && <Button size="sm" loading={changingControl === conversation._id} onClick={() => void changeControl(conversation._id, 'take')}>Tomar conversación</Button>}
                    {conversation.controlMode === 'human_controlled' && <Button size="sm" variant="secondary" loading={changingControl === conversation._id} onClick={() => void changeControl(conversation._id, 'resume')}>Devolver a ALMA</Button>}
                  </div>
                  {isExpanded && <div className="mt-4 max-h-96 space-y-3 overflow-y-auto rounded-2xl border border-white/10 bg-dark-950 p-3" aria-label="Historial de conversación">
                    {conversation.messages?.map(message => (
                      <div key={message._id} className={`rounded-xl p-3 ${message.sender === 'lead' ? 'bg-dark-800' : message.sender === 'ai' ? 'bg-primary-500/10' : 'bg-blue-500/10'}`}>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-xs font-semibold text-white">{message.sender === 'ai' ? 'ALMA' : message.sender === 'lead' ? 'Lead' : 'Usuario'}</span>
                          <span className="text-xs text-dark-500">{message.timestamp ? new Date(message.timestamp).toLocaleString() : ''}</span>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-dark-300">{message.text}</p>
                        {message.processingError && <p className="mt-1 text-xs text-red-300">{message.processingError}</p>}
                      </div>
                    ))}
                    {!conversation.messages?.length && <p className="text-sm text-dark-400">Esta conversación todavía no tiene mensajes.</p>}
                  </div>}
                  {conversation.proposedResponse && ['proposed', 'failed'].includes(conversation.proposedResponse.status) && <div className="mt-3 space-y-2 rounded-xl border border-amber-400/30 bg-amber-500/5 p-3">
                    <p className="text-xs font-semibold text-amber-300">{conversation.proposedResponse.purpose === 'reactivation' ? 'Reactivación contextual' : conversation.proposedResponse.purpose === 'meeting_scheduling' ? 'Propuesta de agenda' : conversation.proposedResponse.purpose === 'meeting_reminder' ? 'Recordatorio de reunión' : conversation.proposedResponse.purpose === 'meeting_followup' ? 'Seguimiento posreunión' : 'Respuesta propuesta'} · modo asistido</p>
                    {conversation.proposedResponse.purpose === 'reactivation' && conversation.proposedResponse.expiresAt && <p className="text-xs text-dark-400">Válida hasta {new Date(conversation.proposedResponse.expiresAt).toLocaleString()}; se revalidará antes del envío.</p>}
                    <textarea value={proposalDrafts[conversation._id] ?? conversation.proposedResponse.text} maxLength={1000} onChange={event => setProposalDrafts(current => ({ ...current, [conversation._id]: event.target.value }))} className="min-h-24 w-full rounded-xl border border-white/10 bg-dark-800 px-3 py-2 text-sm text-white" />
                    {conversation.proposedResponse.errorMessage && <p className="text-xs text-red-300">{conversation.proposedResponse.errorMessage}</p>}
                    {conversation.proposedResponse.invalidationReason && <p className="text-xs text-red-300">Caducó por: {conversation.proposedResponse.invalidationReason}</p>}
                    <div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" loading={changingControl === conversation._id} onClick={() => void saveProposal(conversation)}>Guardar edición</Button><Button size="sm" variant="danger" loading={changingControl === conversation._id} onClick={() => void discardProposal(conversation)}>Descartar</Button><Button size="sm" loading={changingControl === conversation._id} disabled={!(proposalDrafts[conversation._id] ?? conversation.proposedResponse.text).trim()} onClick={() => void sendProposal(conversation)}>Enviar por {conversation.proposedResponse.platform || 'WhatsApp'}</Button></div>
                  </div>}
                  {conversation.proposedResponse?.status === 'sent' && <p className="mt-3 text-xs font-semibold text-emerald-300">Respuesta asistida enviada.</p>}
                  {conversation.controlMode === 'human_controlled' && ['whatsapp', 'instagram', 'facebook'].includes(lastMessage?.platform || conversation.leadId?.platform || '') && <div className="mt-3 space-y-2">
                    <textarea value={drafts[conversation._id] || ''} maxLength={1000} onChange={event => setDrafts(current => ({ ...current, [conversation._id]: event.target.value }))} placeholder={`Responder por ${lastMessage?.platform || conversation.leadId?.platform}...`} className="min-h-20 w-full rounded-xl border border-white/10 bg-dark-800 px-3 py-2 text-sm text-white outline-none focus:border-primary-500" />
                    <Button size="sm" loading={changingControl === conversation._id} disabled={!drafts[conversation._id]?.trim()} onClick={() => void sendHumanMessage(conversation._id)}>Enviar respuesta</Button>
                  </div>}
                </div>
              );
            })}
            {!loading && !conversations.length && <p className="text-dark-400">Aún no hay conversaciones registradas.</p>}
          </div>
        </Card>
      </div>
    </AppLayout>
  );
};
