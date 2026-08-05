const axios = require('axios');

// Config
const BASE_URL = process.env.BASE_URL || 'http://localhost:5001';
const OWNER_EMAIL = process.env.OWNER_EMAIL || `owner+${Date.now()}@example.com`;
const OWNER_PASSWORD = process.env.OWNER_PASSWORD || 'password123';

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function ensureUser() {
  let email = process.env.OWNER_EMAIL || `owner+${Date.now()}@example.com`;

  // Intento registro + login. Si falla por rate limit o credenciales, reintento con email nuevo.
  try {
    console.log('Registrando usuario de prueba...', email);
    await axios.post(`${BASE_URL}/api/v1/auth/register`, { email, password: OWNER_PASSWORD, fullName: 'Local Owner' });
    console.log('Usuario creado');
  } catch (err) {
    if (err.response && (err.response.status === 409 || err.response.status === 400)) {
      console.log('Usuario ya existe — proceder a login');
    } else {
      console.warn('Error al crear usuario (continuando, puede existir ya):', err.message);
    }
  }

  try {
    const loginRes = await axios.post(`${BASE_URL}/api/v1/auth/login`, { email, password: OWNER_PASSWORD });
    return loginRes.data.data.token;
  } catch (err) {
    if (err.response && err.response.status === 429) {
      console.warn('Rate limit en login detectado. Reintentando con email nuevo.');
    } else {
      console.warn('Login falló, reintentando con usuario nuevo:', err.message);
    }

    // Reintentar con email nuevo para evitar bloqueos
    email = `owner+${Date.now()}_${Math.floor(Math.random() * 10000)}@example.com`;
    console.log('Intentando registro con email alternativo:', email);
    await axios.post(`${BASE_URL}/api/v1/auth/register`, { email, password: OWNER_PASSWORD, fullName: 'Local Owner' });
    const loginRes2 = await axios.post(`${BASE_URL}/api/v1/auth/login`, { email, password: OWNER_PASSWORD });
    return loginRes2.data.data.token;
  }
}

async function sendMockInfoEvent(eventId) {
  const payload = {
    entry: [
      { changes: [ { field: 'comments', value: { id: eventId, text: 'INFO', from: { id: `instagram-user-${Math.floor(Math.random()*10000)}` }, platform: 'instagram', media: { id: 'reel-1' } } } ] }
    ]
  };

  const headers = { 'Content-Type': 'application/json', 'x-alma-mock-event': 'true' };
  console.log(`Enviando evento mock INFO (${eventId}) a ${BASE_URL}/api/v1/meta/webhook ...`);
  const res = await axios.post(`${BASE_URL}/api/v1/meta/webhook`, payload, { headers });
  console.log('Webhook response status:', res.status);
  return payload;
}

async function getTasks(token) {
  const res = await axios.get(`${BASE_URL}/api/v1/crm/tasks`, { headers: { Authorization: `Bearer ${token}` } });
  return res.data.data;
}

async function run() {
  console.log('Verificación INFO→CRM iniciada');
  try {
    const token = await ensureUser();
    console.log('Token obtenido');

    const eventId = `manual-info-${Date.now()}`;
    await sendMockInfoEvent(eventId);
    await sleep(900);

    let tasks = await getTasks(token);
    console.log(`Tareas encontradas: ${tasks.length}`);
    if (tasks.length) console.log('Tarea ejemplo:', tasks[0]);

    console.log('Volviendo a enviar el mismo evento para comprobar idempotencia...');
    await sendMockInfoEvent(eventId);
    await sleep(900);

    const tasksAfter = await getTasks(token);
    console.log(`Tareas después del segundo envío: ${tasksAfter.length}`);
    if (tasksAfter.length === tasks.length) {
      console.log('Idempotencia verificada: no se crearon tareas duplicadas.');
    } else {
      console.warn('Advertencia: el número de tareas cambió tras re-enviar el evento.');
    }

    console.log('Verificación completada. Revisa el CRM en la UI o consulta /api/v1/crm/tasks');
  } catch (err) {
    console.error('Error durante la verificación:', err.message || err);
    if (err.response) console.error('Respuesta del servidor:', err.response.status, err.response.data);
    process.exitCode = 2;
  }
}

run();
