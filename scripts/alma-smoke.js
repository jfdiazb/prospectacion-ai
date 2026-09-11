'use strict';
const baseUrl = (process.env.ALMA_SMOKE_API_URL || 'http://127.0.0.1:5001').replace(/\/$/, '');
const email = process.env.ALMA_SMOKE_EMAIL;
const password = process.env.ALMA_SMOKE_PASSWORD;
const timeoutMs = Number(process.env.ALMA_SMOKE_TIMEOUT_MS || 10000);
const results = [];
const request = async (name, path, options = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${path}`, { ...options, signal: controller.signal });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.success === false) throw new Error(`HTTP ${response.status}`);
    results.push({ name, status: 'PASS' });
    return body;
  } catch (error) {
    results.push({ name, status: 'FAIL', detail: error instanceof Error ? error.message : 'unknown' });
    throw error;
  } finally { clearTimeout(timeout); }
};
const main = async () => {
  if (!email || !password) throw new Error('Define ALMA_SMOKE_EMAIL y ALMA_SMOKE_PASSWORD; el smoke no crea usuarios ni omite autenticación.');
  await request('API liveness', '/health');
  const readiness = await request('API/DB readiness', '/api/v1/readiness');
  const login = await request('AUTH login', '/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const token = login?.data?.token;
  if (!token) throw new Error('AUTH respondió sin JWT');
  const headers = { Authorization: `Bearer ${token}` };
  const checks = [
    ['AUTH protected profile', '/api/v1/auth/profile'], ['LEADS', '/api/v1/leads?limit=1'],
    ['CONVERSATIONS/CRM', '/api/v1/crm/conversations'], ['COMMERCIAL CONTEXT', '/api/v1/commercial-context/active'],
    ['AUTOMATIONS', '/api/v1/automations'], ['TASKS/FOLLOW-UP', '/api/v1/crm/tasks'], ['LAUNCHES', '/api/v1/launches'],
  ];
  for (const [name, path] of checks) await request(name, path, { headers });
  const youtube = await request('YOUTUBE status', '/api/v1/youtube/status', { headers });
  if (youtube?.data?.connected) {
    const credential = youtube.data.credential;
    const validChannelId = typeof credential?.channelId === 'string' && /^UC[A-Za-z0-9_-]{22}$/.test(credential.channelId);
    results.push({
      name: 'YOUTUBE monitored channel',
      status: validChannelId ? 'PASS' : 'FAIL',
      detail: validChannelId
        ? `${credential.channelTitle || 'unnamed'} ${credential.channelHandle || 'no-handle'} ${credential.channelId}`
        : 'La conexión no expone un channelId válido',
    });
  }
  for (const [channel, status] of Object.entries(readiness.runtime?.providers || {})) {
    const state = status.configured ? `${status.outbound || 'configured'}` : 'BLOCKED_CONFIG';
    results.push({ name: `PROVIDER ${channel}`, status: 'INFO', detail: state });
  }
};
main().catch(error => {
  if (!results.some(item => item.status === 'FAIL')) results.push({ name: 'SMOKE', status: 'FAIL', detail: error instanceof Error ? error.message : 'unknown' });
}).finally(() => {
  for (const item of results) console.log(`${item.status.padEnd(4)} ${item.name}${item.detail ? ` — ${item.detail}` : ''}`);
  const failed = results.some(item => item.status === 'FAIL');
  console.log(failed ? 'ALMA SMOKE: FAIL' : 'ALMA SMOKE: PASS');
  process.exitCode = failed ? 1 : 0;
});
