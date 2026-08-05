import { useEffect, useState } from 'react';
import { AppLayout } from '@components/AppLayout';
import { Card } from '@components/shared';
import { crmService, type CrmActivity, type CrmConversation, type CrmMeeting, type CrmTask } from '@services/crmService';

export const CrmPage = () => {
  const [activities, setActivities] = useState<CrmActivity[]>([]);
  const [meetings, setMeetings] = useState<CrmMeeting[]>([]);
  const [conversations, setConversations] = useState<CrmConversation[]>([]);
  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [loading, setLoading] = useState(true);

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
          <h2 className="mb-4 text-2xl font-semibold text-white">Reuniones Zoom</h2>
          <div className="space-y-3">
            {meetings.map(meeting => (
              <div key={meeting._id} className="rounded-2xl bg-dark-900 p-4">
                <p className="font-medium text-white">{meeting.leadId?.fullName || meeting.leadId?.username || 'Prospecto'}</p>
                <p className="text-sm text-dark-400">{meeting.topic || 'Reunión de descubrimiento'} · {meeting.status}</p>
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
              return (
                <div key={conversation._id} className="rounded-2xl bg-dark-900 p-4">
                  <p className="font-medium text-white">{conversation.leadId?.fullName || conversation.leadId?.username || 'Prospecto'}</p>
                  <p className="text-sm text-dark-400">Estado: {conversation.status}</p>
                  {lastMessage && (
                    <p className="text-sm text-dark-400 truncate">{lastMessage.sender === 'ai' ? 'ALMA:' : lastMessage.sender === 'lead' ? 'Lead:' : 'Usuario:'} {lastMessage.text}</p>
                  )}
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
