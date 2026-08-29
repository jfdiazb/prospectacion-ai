import { useState, type ReactNode } from 'react';
import { Button, Card } from '@components/shared';
import { whatsappDiagnosticsService, type WhatsAppInboundDiagnostics } from '@services/whatsappDiagnosticsService';

const colombiaIso = (value: string) => new Date(`${value}:00-05:00`).toISOString();
const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
};

export const WhatsAppLiveDiagnostics = () => {
  const [from, setFrom] = useState('2026-08-29T17:50');
  const [to, setTo] = useState('2026-08-29T17:56');
  const [text, setText] = useState('');
  const [result, setResult] = useState<WhatsAppInboundDiagnostics | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const verify = async () => {
    if (!from || !to || !text) return setError('Completa la ventana y el texto de la prueba.');
    setLoading(true); setError(''); setResult(null);
    try {
      const textSha256 = await sha256(text);
      setResult(await whatsappDiagnosticsService.inbound({ from: colombiaIso(from), to: colombiaIso(to), textSha256 }));
      setText('');
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || 'No fue posible verificar el evento.');
    } finally { setLoading(false); }
  };

  const inboundUnique = result?.inboundEventCount === 1 && result.uniqueExternalEventCount === 1;
  const persistedUnique = result?.messagePersistenceCount === 1;
  const leadAssociated = result?.leadMatchCount === 1;
  const conversationAssociated = result?.conversationMatchCount === 1 && result.events.every(event => event.conversationRecorded);
  const completed = result?.events.length === 1 && result.events[0].processingState === 'completed';
  const consolidated = !result ? 'NOT_VERIFIABLE' : inboundUnique && persistedUnique && leadAssociated && conversationAssociated && completed ? 'PASS' : 'FAIL';

  return <Card className="lg:col-span-2" hover={false}>
    <div className="space-y-5">
      <div><p className="text-sm uppercase tracking-[0.3em] text-dark-500">Administración · solo lectura</p><h2 className="text-2xl font-semibold text-white">Diagnóstico WhatsApp LIVE</h2><p className="mt-1 text-sm text-dark-400">La huella SHA-256 se calcula localmente. El texto, teléfonos y credenciales nunca se envían ni se muestran.</p></div>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Desde · hora Colombia"><input aria-label="Desde · hora Colombia" type="datetime-local" value={from} onChange={event => setFrom(event.target.value)} className="mt-2 w-full rounded-xl border border-dark-700 bg-dark-900 px-3 py-2 text-white" /></Field>
        <Field label="Hasta · hora Colombia"><input aria-label="Hasta · hora Colombia" type="datetime-local" value={to} onChange={event => setTo(event.target.value)} className="mt-2 w-full rounded-xl border border-dark-700 bg-dark-900 px-3 py-2 text-white" /></Field>
        <Field label="Texto de la prueba"><input aria-label="Texto de la prueba" type="password" autoComplete="off" value={text} onChange={event => setText(event.target.value)} className="mt-2 w-full rounded-xl border border-dark-700 bg-dark-900 px-3 py-2 text-white" /></Field>
      </div>
      <Button loading={loading} disabled={loading} onClick={() => void verify()}>Verificar inbound</Button>
      {error && <p className="text-sm text-red-300">{error}</p>}
      {result && <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="InboundEvent encontrado" value={result.inboundEventCount} />
          <Metric label="Mensajes persistidos" value={result.messagePersistenceCount} />
          <Check label="Idempotencia" pass={inboundUnique} />
          <Check label="Lead asociado" pass={leadAssociated} />
          <Check label="Conversación asociada" pass={conversationAssociated} />
          <Metric label="Outbound actual" value={result.outboundMode.toUpperCase()} />
          <Metric label="Auto-reply" value={String(result.autoReplyEnabled).toUpperCase()} />
        </div>
        <div className={`rounded-2xl border p-4 text-center font-semibold ${consolidated === 'PASS' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-red-500/30 bg-red-500/10 text-red-300'}`}>WHATSAPP INBOUND LIVE: {consolidated}</div>
      </div>}
    </div>
  </Card>;
};

const Field = ({ label, children }: { label: string; children: ReactNode }) => <label className="text-xs text-dark-400">{label}{children}</label>;
const Metric = ({ label, value }: { label: string; value: string | number }) => <div className="rounded-2xl bg-dark-900 p-4"><p className="text-xs text-dark-400">{label}</p><p className="mt-2 text-xl font-semibold text-white">{value}</p></div>;
const Check = ({ label, pass }: { label: string; pass: boolean }) => <Metric label={label} value={pass ? 'PASS' : 'FAIL'} />;
