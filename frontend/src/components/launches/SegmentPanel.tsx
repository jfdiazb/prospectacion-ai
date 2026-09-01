import { useState } from 'react';
import { Badge, Button, Card } from '@components/shared';
import {
  launchService,
  type Launch,
  type SegmentDefinition,
  type SegmentPreviewItem,
  type SegmentRule,
} from '@services/launchService';

const fields = [
  'score',
  'interest_level',
  'status',
  'normalized_intent',
  'tags',
  'product_interest',
  'business_interest',
  'origin',
  'channel',
  'recent_activity_days',
  'active_meeting',
  'previous_participation',
];
export const SegmentPanel = ({
  launch,
  refresh,
}: {
  launch: Launch;
  refresh: () => Promise<void>;
}) => {
  const [logic, setLogic] = useState<'AND' | 'OR'>(launch.targetSegment?.logic || 'AND');
  const [rules, setRules] = useState<SegmentRule[]>(
    launch.targetSegment?.rules?.map(rule => ({ ...rule, id: rule.id || crypto.randomUUID() })) || [
      { id: crypto.randomUUID(), field: 'score', operator: 'gte', value: 50 },
    ]
  );
  const [preview, setPreview] = useState<SegmentPreviewItem[]>([]);
  const [version, setVersion] = useState(launch.targetSegmentVersion || 0);
  const [message, setMessage] = useState('');
  const [included, setIncluded] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const definition = (): SegmentDefinition => ({ schemaVersion: 1, logic, rules, groups: [] });
  const savePreview = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const saved = await launchService.saveSegment(launch._id, definition());
      setVersion(saved.version);
      const result = await launchService.previewSegment(launch._id);
      setPreview(result.items);
      setIncluded(Object.fromEntries(result.items.map(item => [item.leadId, item.eligible])));
      setVersion(result.version);
      setMessage('Segmento validado. Revisa razones antes de confirmar.');
    } catch (error: any) {
      setMessage(error?.response?.data?.message || 'No fue posible validar el segmento.');
    } finally { setBusy(false); }
  };
  const confirm = async () => {
    if (busy) return;
    const decisions = preview.map(item => ({
      leadId: item.leadId,
      action: included[item.leadId] ? ('include' as const) : ('exclude' as const),
      reason: included[item.leadId] ? undefined : 'Exclusión manual confirmada desde preview',
    }));
    try {
      setBusy(true);
      await launchService.select(launch._id, version, decisions);
      setMessage('Selección confirmada con trazabilidad.');
      await refresh();
    } catch (error: any) {
      setMessage(error?.response?.data?.message || 'No fue posible confirmar la selección.');
    } finally { setBusy(false); }
  };
  const update = (index: number, key: keyof SegmentRule, value: unknown) =>
    setRules(current => current.map((rule, i) => (i === index ? { ...rule, [key]: value } : rule)));
  return (
    <div className="space-y-4">
      <Card hover={false}>
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="mr-auto text-xl font-semibold">Segmentación asistida</h3>
          <Select
            label="Lógica"
            value={logic}
            options={['AND', 'OR']}
            onChange={value => setLogic(value as 'AND' | 'OR')}
          />
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() =>
              setRules(current => [
                ...current,
                { id: crypto.randomUUID(), field: 'score', operator: 'gte', value: 50 },
              ])
            }
          >
            Añadir criterio
          </Button>
          <Button loading={busy} disabled={busy} onClick={() => void savePreview()}>Guardar y previsualizar</Button>
        </div>
        <div className="mt-4 space-y-3">
          {rules.map((rule, index) => (
            <div
              key={rule.id}
              className="grid gap-3 rounded-2xl border border-white/10 p-3 md:grid-cols-[1fr_1fr_1fr_auto]"
            >
              <Select
                label="Campo"
                value={rule.field}
                options={fields}
                onChange={value => update(index, 'field', value)}
              />
              <Select
                label="Operador"
                value={rule.operator}
                options={['eq', 'neq', 'contains', 'in', 'gte', 'lte', 'exists']}
                onChange={value => update(index, 'operator', value)}
              />
              <label className="text-xs text-dark-300">
                Valor
                <input
                  aria-label="Valor"
                  value={String(rule.value ?? '')}
                  onChange={event =>
                    update(
                      index,
                      'value',
                      ['score', 'recent_activity_days'].includes(rule.field)
                        ? Number(event.target.value)
                        : ['true', 'false'].includes(event.target.value)
                          ? event.target.value === 'true'
                          : event.target.value
                    )
                  }
                  className="mt-1 w-full rounded-xl border border-dark-600 bg-dark-900 px-3 py-2"
                />
              </label>
              <Button
                variant="danger"
                onClick={() => setRules(current => current.filter((_, i) => i !== index))}
                disabled={busy || rules.length === 1}
              >
                Quitar
              </Button>
            </div>
          ))}
        </div>
        {message && <p className="mt-3 text-sm text-primary-300">{message}</p>}
      </Card>
      {preview.length > 0 && (
        <Card hover={false}>
          <div className="flex items-center">
            <h3 className="mr-auto text-lg font-semibold">Preview ({preview.length})</h3>
            <Button loading={busy} disabled={busy} onClick={() => void confirm()}>Confirmar selección humana</Button>
          </div>
          <div className="mt-4 max-h-96 space-y-2 overflow-auto">
            {preview.map(item => (
              <div key={item.leadId} className="rounded-xl border border-white/10 p-3">
                <div className="flex gap-2">
                  <input
                    aria-label={`Seleccionar ${item.lead?.fullName || item.lead?.username || item.leadId}`}
                    type="checkbox"
                    checked={Boolean(included[item.leadId])}
                    disabled={!item.eligible}
                    onChange={event => setIncluded(current => ({ ...current, [item.leadId]: event.target.checked }))}
                  />
                  <strong>{item.lead?.fullName || item.lead?.username || item.leadId}</strong>
                  <Badge variant={item.eligible ? 'success' : 'danger'}>
                    {item.eligible ? 'Elegible' : 'Excluido'}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-dark-400">
                  {item.reasons
                    .map(reason => `${reason.field || 'seguridad'}: ${reason.code}`)
                    .join(' · ')}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};
const Select = ({
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
      className="mt-1 w-full rounded-xl border border-dark-600 bg-dark-900 px-3 py-2"
    >
      {options.map(option => (
        <option key={option}>{option}</option>
      ))}
    </select>
  </label>
);
