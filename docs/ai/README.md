# Documentación AI - Prospectación AI

## Healthcheck estable y continuidad del poller — 2026-08-08
- Render había registrado fallos de salud `429`: `/health` estaba detrás del limitador general de 100 solicitudes por 15 minutos.
- El healthcheck ahora se expone antes de `generalLimiter`, por lo que conserva respuesta `200` sin reducir la protección de las rutas API.
- La corrección evita reinicios periódicos que podían interrumpir la ingesta de comentarios de YouTube.
- La suite cubre 105 solicitudes consecutivas a `/health` sin rate limiting.

## Zoom live en producción — 2026-08-08
- La aplicación Server-to-Server OAuth `ALMA Prospectación` está activa y limitada al permiso de creación de reuniones para usuarios de la cuenta.
- Las cuatro credenciales/identificadores live permanecen como secretos externos de Render; `render.yaml` fija solamente `ZOOM_MODE=live`.
- El despliegue posterior al cambio quedó `live` y `GET /health` respondió `{"success":true,"status":"ok"}`.
- La siguiente reunión solicitada por YouTube debe crear un enlace real; verificar en CRM/MongoDB `status=scheduled`, `externalId` y `joinUrl`.

## Privacidad de agenda en YouTube — 2026-08-08
- En YouTube, ALMA evita pedir correo dentro del hilo público y asocia la reunión al identificador interno `youtube:<leadId>`.
- El flujo público solicita únicamente fecha, hora y ciudad/zona horaria; la coordinación humana posterior puede usar el hilo sin exponer datos personales.
- El flujo real quedó validado hasta reunión `pending_configuration`: prospecto externo, calificación, seguimiento, conversación continua y datos de agenda completos para `2026-08-09 10:00 America/Bogota`.

## Conversación continua en hilos de YouTube — 2026-08-08
- ALMA relee respuestas de hilos recientes a partir de los `OutboundMessage.youtube_reply` persistidos y responde siempre sobre el comentario raíz.
- La consulta de respuestas usa un intervalo separado de 2 minutos, máximo 5 hilos activos y 7 días de actividad para mantenerse dentro de la cuota gratuita de YouTube.
- Se ignoran eventos cuyo autor sea el canal conectado, evitando que ALMA procese sus propias respuestas.

## YouTube live persistente en Render — 2026-08-08
- `render.yaml` mantiene la ingesta y la mensajería de YouTube en modo `live` para que cada despliegue conserve el recorrido real comentario `INFO` → ALMA → respuesta.
- Los valores sensibles de OAuth permanecen fuera del repositorio como secretos de Render.
- La prueba real `INFO ALMA` fue capturada y recibió respuesta oficial de ALMA en YouTube; quedan por validar conversacionalmente calificación, seguimiento y agenda Zoom.

## YouTube live y cursor tolerante — 2026-08-08
- El cliente OAuth de Google Cloud ya incluye `https://alma-backend-9eo1.onrender.com/api/v1/youtube/oauth/callback` y Render contiene las credenciales cifradas/secretas requeridas.
- Ingesta y mensajería YouTube están activas en producción; ALMA muestra conectado el canal `100 % Mentalmente`.
- Para no perder comentarios que la API expone con retraso o que coinciden con un despliegue, cada sondeo solapa 60 minutos mediante `YOUTUBE_POLL_OVERLAP_MS` (configurable) y limita el retroceso a `connectedAt`.
- El reprocesamiento del solapamiento es seguro porque `InboundEvent.externalEventId=youtube:<commentId>` mantiene idempotencia.
- El recorrido comentario principal `INFO` → ingesta → ALMA → respuesta oficial está validado en producción.

## Despliegue público verificado — 2026-08-07
- Frontend: `https://prospectacion-ai.vercel.app` (Vercel, Vite, raíz `frontend`).
- Backend: `https://alma-backend-9eo1.onrender.com` (Render Free, Node 20); healthcheck público aprobado.
- Persistencia: MongoDB Atlas con usuario de aplicación de privilegio mínimo y allowlist limitada a los dos rangos CIDR salientes de Render.
- Integración comprobada creando un usuario desde la URL pública y accediendo al dashboard con JWT.
- `CORS_ORIGIN` permite el dominio definitivo de Vercel y `VITE_API_URL` usa `/api/v1` del backend público.
- Todos los proveedores externos continúan en `mock`; el despliegue no contacta YouTube, Meta, Gemini ni Zoom.

## YouTube OAuth e ingesta incremental — 2026-08-07
- La pantalla `/configuracion` consulta el estado del canal y permite iniciar OAuth o eliminar la conexión sin manipular tokens desde el navegador.
- Endpoints: `GET /api/v1/youtube/oauth/connect` (JWT), `GET /api/v1/youtube/oauth/callback`, `GET /api/v1/youtube/status` (JWT) y `DELETE /api/v1/youtube/connection` (JWT).
- El estado OAuth está firmado con HMAC y expira en 10 minutos. Google se solicita con acceso offline, consentimiento explícito y scope `youtube.force-ssl` para leer/moderar comentarios y publicar respuestas.
- `YouTubeCredential` almacena canal, fechas y tokens cifrados con AES-256-GCM; cada valor usa IV y etiqueta de autenticación propios. La clave nunca se guarda en MongoDB.
- `YouTubeTokenService` intercambia el código, descubre el canal autorizado y renueva el access token 60 segundos antes de expirar.
- `YouTubeIngestionService` consulta hasta 100 hilos recientes por intervalo, procesa en orden cronológico y usa `youtube:<commentId>` como clave idempotente. No importa comentarios anteriores al momento inicial de conexión.
- Comentarios `INFO` ingresan al mismo flujo CRM/ALMA: lead YouTube, conversación, calificación, tareas, respuesta y `OutboundMessage`.
- Modos seguros por defecto: `YOUTUBE_MESSAGING_MODE=mock` y `YOUTUBE_INGESTION_MODE=mock`. Live requiere cliente/secreto OAuth, redirect URI, secreto de estado, clave de cifrado y `CRM_OWNER_ID`.

## Render Free — 2026-08-07
- `render.yaml` fija `plan: free` para evitar que el Blueprint use `starter` por defecto y solicite una tarjeta.
- La instancia gratuita es adecuada para la primera verificación pública; puede suspenderse tras inactividad y reiniciar al recibir una petición.
- El lockfile del backend se regeneró con npm 10 para mantener `npm ci` reproducible en Render/Node 20, incluyendo el peer opcional `gcp-metadata` requerido por la resolución de dependencias.
- `backend/tsconfig.json` usa resolución `Node16`, compatible con TypeScript 5.9 y el runtime Node 20 de Render.
- El comando de build incluye dependencias de desarrollo explícitamente para disponer de TypeScript y `@types/*` aunque Render configure `NODE_ENV=production` durante la compilación.

## Preparación de producción — 2026-08-06
- Backend preparado para Render mediante `render.yaml`: build TypeScript, healthcheck `/health`, MongoDB Atlas por secreto y proveedores externos explícitamente en `mock`.
- Frontend preparado para Vercel mediante `frontend/vercel.json`, con build Vite y fallback de rutas SPA.
- El contenedor backend usa el puerto dinámico de la plataforma y ambos contextos Docker excluyen `.env`, dependencias, cobertura y artefactos de pruebas.
- Procedimiento operativo completo en `docs/DEPLOYMENT.md`; el despliegue inicial no genera tráfico hacia YouTube, Meta, Gemini ni Zoom.
- Próximo bloque tras validar URLs públicas: OAuth 2.0 de YouTube, almacenamiento/renovación segura de tokens e ingesta incremental de comentarios.

## Base del canal YouTube — 2026-08-06
- YouTube ya es el único canal seleccionable por defecto en Lead Hunter y la fuente principal del gráfico demo del dashboard.
- Los ejemplos generales de `docs/API.md` y `docs/GUIA_DESARROLLO.md` usan `platform: youtube`; las rutas Meta permanecen documentadas solo en su sección técnica de compatibilidad.
- `YouTubeMessagingProvider` implementa el contrato de respuesta a un comentario mediante `POST /youtube/v3/comments?part=snippet`, usando `snippet.parentId` y `snippet.textOriginal`.
- `YOUTUBE_MESSAGING_MODE=mock` no realiza red. El live exige token OAuth y persiste la respuesta mediante el mismo `MessagingService` usado por otros canales.
- Modelos habilitados: `InboundEvent.channel=youtube`, `OutboundMessage.channel=youtube`, `messageType=youtube_reply`, `provider=youtube|mock`.
- Seguridad: no usar service accounts para un canal YouTube normal. La activación definitiva requiere OAuth 2.0 para aplicación web, consentimiento, refresh token cifrado y scope mínimo para gestionar comentarios.
- Próximo bloque: lector incremental de comentarios con `commentThreads.list`, cursor/idempotencia y conexión con `AlmaService`; no existe todavía polling live.

## Modos locales y diagnóstico — 2026-08-06
- Usar `AI_MODE=mock` para pruebas aisladas; esto garantiza `MockAIProvider` incluso si `.env` contiene una clave Gemini.
- `AI_MODE=live` requiere `GEMINI_API_KEY`; valores distintos de `mock|live` detienen el arranque con un error claro.
- Si existe `CRM_OWNER_ID`, el arranque valida formato hexadecimal de 24 caracteres y existencia del usuario después de conectar MongoDB. Marcadores como `<ID>` ya no producen un `500` tardío en el webhook.
- Solo existe una tarea `follow_up` pendiente por lead/conversación: una nueva interacción actualiza vencimiento, prioridad y metadatos de la tarea abierta.
- Configuración local recomendada: `AI_MODE=mock`, mensajería mock y `ZOOM_MODE=mock`; las credenciales live no son necesarias.

## Canal principal y compatibilidad — 2026-08-06
- YouTube es el canal principal para toda experiencia y contenido nuevo de ALMA.
- Meta no se reactiva ni se usa como estrategia de producto: su código queda preservado exclusivamente para compatibilidad y una eventual operación autorizada mediante APIs oficiales.
- No se modificaron todavía los defaults históricos de Instagram presentes en Hunter/frontend; requieren una migración específica a YouTube.

## Arquitectura definitiva de mensajería Meta — 2026-08-06
- `MessagingProvider` admite destinatarios tipados de comentario Instagram, usuario Instagram-scoped y teléfono WhatsApp.
- `MetaMessagingProvider` es el único cliente de Graph API para envíos; construye el payload oficial según el tipo de destinatario.
- `MessagingService` es la frontera de persistencia común: canal, tipo, proveedor, estado, ID externo, destinatario, fechas y error sanitizado.
- `WhatsAppController` mantiene verificación HMAC y compatibilidad de ruta, reclama cada `message.id` mediante `InboundEvent` y delega el envío al proveedor.
- Se retiró la copia provisional de webhook/transporte que estaba dentro de `GeminiService` y carecía de validación de firma.
- Modos: Instagram usa `INSTAGRAM_MESSAGING_MODE` (`META_MESSAGING_MODE` sigue aceptado); WhatsApp usa `WHATSAPP_MESSAGING_MODE`. Ambos admiten `mock|live`.
- `WHATSAPP_AUTO_REPLY_ENABLED=false` conserva el envío automático apagado; al activarlo en live se validan token, Phone Number ID y App Secret.

## Orquestación conversacional de reuniones — 2026-08-06
- Una intención de cita crea un `Meeting` en `pending_details`, sin llamar todavía a Zoom.
- Los mensajes posteriores completan `attendeeEmail`, `requestedDate`, `requestedTime` y `timezone` sobre el mismo registro de conversación.
- ALMA sustituye la respuesta genérica por una pregunta concreta con los campos faltantes.
- Se reconocen fechas `YYYY-MM-DD`, `DD/MM/YYYY` y `mañana`; horas `HH:mm`, `h:mm am/pm` y `h am/pm`; zonas IANA y ciudades latinoamericanas frecuentes.
- Antes de crear se convierte la hora local a UTC, se valida que exista en calendario y que esté en el futuro.
- Con datos completos, mock deja confirmación pendiente y live devuelve el enlace real. Reintentos conversacionales no duplican reuniones finalizadas.
- El prospecto puede cancelar el borrador escribiendo una intención explícita de cancelación.

### Ejemplo de flujo
1. Prospecto: `Quiero agendar una reunión`.
2. ALMA pide correo, fecha, hora y ciudad/zona horaria.
3. Prospecto: `prospecto@example.com, 20/08/2027 a las 3:30 pm en Bogotá`.
4. ALMA valida, crea una única reunión mediante el proveedor configurado y registra la tarea CRM asociada.

## Zoom Server-to-Server OAuth — 2026-08-06
- `ZoomProvider` solicita tokens en `https://zoom.us/oauth/token` mediante `grant_type=account_credentials` y autenticación Basic.
- El token se conserva únicamente en memoria hasta poco antes de expirar y nunca se escribe en MongoDB ni logs.
- Las reuniones se crean con `POST https://api.zoom.us/v2/users/{ZOOM_USER_ID}/meetings`, autenticación Bearer, sala de espera y entrada antes del anfitrión deshabilitada.
- `ZOOM_MODE=mock` conserva el flujo local y registra `pending_configuration`; `ZOOM_MODE=live` registra `scheduled` con `externalId` y `joinUrl`.
- Fallos de configuración, OAuth, timeout, HTTP o respuesta inválida se guardan como `Meeting.status=failed` con `errorCode`, `errorMessage` y `failedAt`; la respuesta comercial de ALMA continúa su envío.
- Variables live: `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`, `ZOOM_USER_ID`; opcionales `ZOOM_TIMEOUT_MS` y `ZOOM_MEETING_DURATION_MINUTES`.

### Activación de Zoom live
1. Crear y activar una aplicación Server-to-Server OAuth en Zoom Marketplace.
2. Conceder únicamente el scope granular `meeting:write:meeting:admin` (o el scope equivalente permitido por la cuenta) para crear reuniones del anfitrión.
3. Configurar las cuatro credenciales/identificadores y verificar que `ZOOM_USER_ID` corresponda a un usuario anfitrión habilitado para reuniones.
4. Establecer `ZOOM_MODE=live`, reiniciar el backend y enviar una conversación que solicite una reunión.
5. Verificar en MongoDB `Meeting.status=scheduled`, `externalId` y `joinUrl`; ante fallo, revisar solamente el código/mensaje sanitizado almacenado.

## Mensajería Instagram — 2026-08-06
- `integrations/messaging` desacopla ALMA del canal mediante `MessagingProvider`, con implementaciones mock y Meta.
- `AlmaService` genera y registra la respuesta como antes, y delega la entrega a `MessagingService`.
- La primera respuesta privada usa el ID externo del comentario; los mensajes posteriores usan el Instagram-scoped user ID recibido en Direct.
- `OutboundMessage` registra `pending`, `sent`, `delivered`, `failed` o `simulated`, además de proveedor, destinatario, `commentId`, ID externo, fechas y errores.
- `sourceEventId` es único; junto con `InboundEvent.externalEventId` evita dobles respuestas ante reintentos del webhook.
- Variables: `META_ACCESS_TOKEN`, `META_IG_USER_ID`, `META_GRAPH_API_VERSION`, `META_MESSAGING_MODE` y opcional `META_MESSAGING_TIMEOUT_MS`.
- En `mock` no hay tráfico externo. En `live`, Meta recibe `POST /{META_IG_USER_ID}/messages` con token Bearer; los errores se persisten sin registrar el token.
- Zoom permanece sin cambios y no se activa en este bloque.

### Prueba local de mensajería
1. Configurar MongoDB/JWT/propietario y usar `META_MESSAGING_MODE=mock`, `META_MOCK_MODE=true` y `NODE_ENV` distinto de producción.
2. Levantar el backend y verificar el webhook con `META_VERIFY_TOKEN`.
3. Enviar un evento de comentario con encabezado `X-ALMA-MOCK-EVENT: true`; comprobar lead, conversación y `OutboundMessage.deliveryStatus=simulated`.
4. Enviar después un evento Direct del mismo Instagram-scoped ID y comprobar `messageType=direct_message`.
5. Para live, desactivar `META_MOCK_MODE`, configurar secreto, token, IG user ID y versión, establecer `META_MESSAGING_MODE=live`, suscribir el webhook público en Meta y probar primero con una cuenta autorizada.

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
