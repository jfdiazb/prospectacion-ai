import { FormEvent, useEffect, useState } from 'react';
import { Button } from '@components/shared';
import type { Launch, LaunchInput } from '@services/launchService';

const local = (value?: string) => (value ? new Date(value).toISOString().slice(0, 16) : '');
export const LaunchForm = ({
  launch,
  onSave,
  onCancel,
}: {
  launch?: Launch;
  onSave: (value: LaunchInput) => Promise<void>;
  onCancel: () => void;
}) => {
  const [form, setForm] = useState({
    name: '',
    typeKey: 'generic',
    description: '',
    objective: '',
    timezone: 'America/Bogota',
    startsAt: '',
    eventStartsAt: '',
    eventEndsAt: '',
    closesAt: '',
    channels: ['whatsapp', 'instagram', 'facebook'],
    requireRegistration: true,
  });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (launch)
      setForm({
        name: launch.name,
        typeKey: launch.typeKey,
        description: launch.description || '',
        objective: launch.objective || '',
        timezone: launch.timezone,
        startsAt: local(launch.startsAt),
        eventStartsAt: local(launch.eventStartsAt),
        eventEndsAt: local(launch.eventEndsAt),
        closesAt: local(launch.closesAt),
        channels: launch.allowedChannels || [],
        requireRegistration: launch.registrationConfig?.requireRegistrationForConfirmation !== false,
      });
  }, [launch]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await onSave({
        name: form.name,
        typeKey: form.typeKey,
        description: form.description,
        objective: form.objective,
        timezone: form.timezone,
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : undefined,
        eventStartsAt: form.eventStartsAt ? new Date(form.eventStartsAt).toISOString() : undefined,
        eventEndsAt: form.eventEndsAt ? new Date(form.eventEndsAt).toISOString() : undefined,
        closesAt: form.closesAt ? new Date(form.closesAt).toISOString() : undefined,
        allowedChannels: form.channels,
        registrationConfig: { requireRegistrationForConfirmation: form.requireRegistration },
        followUpConfig: launch?.followUpConfig || { assistedOnly: true },
        selectionMode: 'assisted',
        idempotencyKey: crypto.randomUUID(),
      });
    } finally {
      setSaving(false);
    }
  };
  const set = (key: string, value: string) => setForm(current => ({ ...current, [key]: value }));
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Nombre" value={form.name} onChange={value => set('name', value)} required />
        <Field
          label="Tipo"
          value={form.typeKey}
          onChange={value => set('typeKey', value)}
          required
        />
        <Field
          label="Descripción"
          value={form.description}
          onChange={value => set('description', value)}
        />
        <Field
          label="Objetivo"
          value={form.objective}
          onChange={value => set('objective', value)}
        />
        <Field
          label="Timezone IANA"
          value={form.timezone}
          onChange={value => set('timezone', value)}
          required
        />
        {(['startsAt', 'eventStartsAt', 'eventEndsAt', 'closesAt'] as const).map((key, index) => (
          <Field
            key={key}
            type="datetime-local"
            label={['Inicio', 'Inicio del evento', 'Fin del evento', 'Cierre'][index]}
            value={form[key]}
            onChange={value => set(key, value)}
          />
        ))}
      </div>
      <fieldset>
        <legend className="text-sm text-dark-300">Canales permitidos</legend>
        <div className="mt-2 flex gap-4">
          {['whatsapp', 'instagram', 'facebook', 'youtube'].map(channel => (
            <label key={channel} className="text-sm">
              <input
                type="checkbox"
                checked={form.channels.includes(channel)}
                onChange={() =>
                  setForm(current => ({
                    ...current,
                    channels: current.channels.includes(channel)
                      ? current.channels.filter(item => item !== channel)
                      : [...current.channels, channel],
                  }))
                }
              />{' '}
              <span className="ml-1">{channel}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block text-sm text-dark-300"><input type="checkbox" checked={form.requireRegistration} onChange={event => setForm(current => ({ ...current, requireRegistration: event.target.checked }))} /> <span className="ml-1">Exigir registro antes de confirmar</span></label>
      <p className="text-xs text-amber-300">
        Crear o editar no envía mensajes. Toda salida requiere revisión humana.
      </p>
      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" loading={saving}>
          Guardar
        </Button>
      </div>
    </form>
  );
};
const Field = ({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) => (
  <label className="text-sm text-dark-300">
    {label}
    <input
      aria-label={label}
      required={required}
      type={type}
      value={value}
      onChange={event => onChange(event.target.value)}
      className="mt-1 w-full rounded-xl border border-dark-600 bg-dark-900 px-3 py-2 text-white"
    />
  </label>
);
