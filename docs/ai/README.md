# Documentación AI - Prospectación AI

## Avance ALMA — 2026-08-03
- Entrada backend canónica: `backend/src/index.ts`; `src/server.ts` y `server.js` solo conservan compatibilidad.
- Webhook Meta disponible en `GET/POST /api/v1/meta/webhook`.
- Los POST validan `X-Hub-Signature-256`, ignoran reintentos mediante `InboundEvent` y detectan `INFO` sin distinguir mayúsculas.
- Al detectar `INFO`, se crea o reutiliza el lead de Instagram y se registra el mensaje en una conversación.
- Variables nuevas: `META_APP_SECRET`, `META_VERIFY_TOKEN` y `CRM_OWNER_ID`.
- La suite de integración está aislada con `mongodb-memory-server`; su ejecución requiere que el binario de Mongo esté disponible en caché o pueda descargarse.
- `AlmaService` ofrece un modo local determinista: califica intención, interés y rechazo, actualiza el lead, genera la siguiente respuesta y agenda seguimiento sin servicios externos.
- Los modelos `Activity`, `Meeting` y `Task` mantienen la trazabilidad CRM. Una petición de cita queda `pending_configuration` hasta configurar Zoom.
- ALMA crea automáticamente tareas CRM de seguimiento y reunión cuando detecta `INFO`.
- Endpoints JWT de lectura CRM: `GET /api/v1/crm/conversations`, `/activities`, `/meetings` y `/tasks`.
- La pantalla `CrmPage` consume actividades y reuniones reales mediante `frontend/src/services/crmService.ts`; ya no muestra contactos o citas ficticias.
- Arquitectura de arranque: `app.ts` configura Express, `index.ts` carga/valida entorno, conecta MongoDB y escucha; `server.ts` es únicamente un shim legado.
- Proveedores externos: `integrations/ai` selecciona Gemini o mock; `integrations/meetings` selecciona Zoom o una reunión simulada con URL `.invalid`.
- El test `mock Meta INFO event should create and qualify a lead` valida GET Meta, POST INFO, idempotencia, lead warm/65, conversación, actividades y evento persistido.

## Resumen del proyecto
`prospectacion-ai` es una plataforma SaaS para automatizar la captación y gestión de prospectos en redes sociales usando inteligencia artificial.

## Arquitectura
- `frontend/`: React 18 + TypeScript + TailwindCSS
- `backend/`: Node.js + Express + MongoDB
- `docs/ai/`: documentación técnica resumida del proyecto

### Capas principales
1. **Frontend**
   - Páginas: `src/pages`
   - Componentes: `src/components`
   - Estado/Contexto: `src/context`, `src/hooks`
   - Servicios API: `src/services`
   - Tipos: `src/types`

2. **Backend**
   - Rutas: `backend/src/routes`
   - Controladores: `backend/src/controllers`
   - Servicios de negocio: `backend/src/services`
   - Modelos de datos: `backend/src/models`
   - Middlewares: `backend/src/middlewares`

## Componentes clave
- `frontend/src/components/AppLayout.tsx`
- `frontend/src/components/Navbar.tsx`
- `frontend/src/components/Sidebar.tsx`
- `frontend/src/components/shared.tsx`
- `frontend/src/pages/DashboardPage.tsx`
- `frontend/src/context/AuthContext.tsx`
- `frontend/src/services/leadService.ts`

## Tecnologías principales
- React 18
- TypeScript
- TailwindCSS
- Framer Motion
- Lucide React
- Recharts
- Axios
- React Router DOM
- Node.js
- Express
- MongoDB
- JWT

## Flujo del sistema
1. El usuario inicia sesión con autenticación JWT.
2. El frontend consume la API backend para obtener datos de leads, estadísticas y usuarios.
3. El backend procesa requests, valida datos y accede a MongoDB.
4. El dashboard muestra estadísticas y gráficos interactivos.
5. Las acciones del usuario (crear lead, actualizar estado, ver prospectos) pasan por servicios y endpoints.

## Reglas de diseño
- Mantener UI responsive y accesible.
- Usar animaciones suaves con `framer-motion`.
- Aplicar hover effects consistentes en tarjetas y botones.
- Preferir componentes reutilizables.
- Mantener estilos en Tailwind con clases semánticas y escalables.
- Preservar modo oscuro elegante.
- Documentar cambios de arquitectura y estado en este archivo.

## Estado actual
- API consolidada con rutas protegidas, healthcheck y configuración de seguridad inicial.
- CRUD de leads expuesto mediante el controlador y servicio existentes; frontend alineado con rutas Hunter/Scraper.
- Validaciones estáticas: backend y frontend compilan. El bundle frontend requiere code-splitting por tamaño inicial.
- WhatsApp permanece desactivado por defecto hasta configurar credenciales oficiales, firma y gobernanza por tenant.
- Frontend revisado y modernizado.
- Dashboard con componentes visuales y gráficos.
- Síntesis de documentación creada en `AGENTS.md` y este archivo.
- `lucide-react` instalado y usado en el frontend.
- `npm run type-check` pasa.

## Pendientes
- Añadir pruebas unitarias en frontend/backend.
- Crear documentación de API con Swagger o OpenAPI.
- Agregar status y notas sobre cambios en `docs/ai/README.md` tras cada tarea.
- Incluir un sistema de actualizaciones automáticas de documentación bajo cambios de proyecto.
- Documentar endpoints exactos de backend en `docs/ai/` si son expandidos.
