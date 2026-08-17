import { useEffect, useState } from 'react';
import { AppLayout } from '@components/AppLayout';
import { Button, Card } from '@components/shared';
import { crmService, type CrmActivity, type CrmConversation, type CrmMeeting, type CrmTask } from '@services/crmService';

export const CrmPage = () => {
  const [activities, setActivities] = useState<CrmActivity[]>([]);
  const [meetings, setMeetings] = useState<CrmMeeting[]>([]);
  const [conversations, setConversations] = useState<CrmConversation[]>([]);
  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [changingControl, setChangingControl] = useState<string | null>(null);
  const [changingTask, setChangingTask] = useState<string | null>(null);
  const [expandedConversation, setExpandedConversation] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

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

  useEffect(() => {
    Promise.all([crmService.activities(), crmService.meetings(), crmService.conversations(), crmService.tasks()])
      .then(([activityData, meetingData, conversationData, taskData]) => {
        setActivities(activityData);
        setMeetings(meetingData);
        setConversations(conversationData);
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
                {meeting.scheduledFor && <p className="text-xs text-dark-500">{new Date(meeting.scheduledFor).toLocaleString()}</p>}
                {meeting.joinUrl && meeting.status === 'scheduled' && (
                  <a className="mt-2 inline-block text-sm font-medium text-primary-400 hover:text-primary-300" href={meeting.joinUrl} target="_blank" rel="noreferrer">Abrir acceso privado</a>
                )}
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
                      </div>
                    ))}
                    {!conversation.messages?.length && <p className="text-sm text-dark-400">Esta conversación todavía no tiene mensajes.</p>}
                  </div>}
                  {conversation.controlMode === 'human_controlled' && lastMessage?.platform === 'whatsapp' && <div className="mt-3 space-y-2">
                    <textarea value={drafts[conversation._id] || ''} maxLength={1000} onChange={event => setDrafts(current => ({ ...current, [conversation._id]: event.target.value }))} placeholder="Responder por WhatsApp..." className="min-h-20 w-full rounded-xl border border-white/10 bg-dark-800 px-3 py-2 text-sm text-white outline-none focus:border-primary-500" />
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
