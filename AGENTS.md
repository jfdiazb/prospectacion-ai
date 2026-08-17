# AGENTS.md

## Conversaciones CRM operativas y continuidad sin bloqueo — 2026-08-16
- ALMA dispone de continuaciones no interrogativas cuando ya agotó las preguntas de descubrimiento; una conversación larga deja de fallar por no poder reservar otra pregunta única y avanza al siguiente paso.
- Los reintentos de eventos YouTube conservan `conversationRecordedAt` y no vuelven a insertar el mismo mensaje del prospecto en el historial.
- YouTube Monitor excluye de la alerta de espera los hilos bajo transferencia o control humano; solo alerta conversaciones automatizadas cuyo último mensaje pertenece al lead.
- CRM permite abrir/cerrar el historial completo de cada conversación y marcar tareas como terminadas o reabrirlas mediante una ruta autenticada y aislada por propietario.
- Validación vigente: 72/72 pruebas backend, compilación backend, type-check y compilación frontend correctos.

## Preparación de activación oficial de WhatsApp — 2026-08-11
- El Blueprint declara `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET` y `VERIFY_TOKEN` como secretos externos de Render; ningún valor real se almacena en el repositorio.
- La inspección segura confirmó que esas cuatro credenciales aún no están disponibles localmente. Producción conserva mensajería mock y auto-respuesta apagada para evitar un arranque inválido o tráfico accidental.
- `docs/DEPLOYMENT.md` documenta la secuencia mock firmado → live controlado → handoff humano y la reversión inmediata mediante `WHATSAPP_AUTO_REPLY_ENABLED=false`.
- Pendiente operativo: crear/configurar la aplicación oficial de Meta, guardar los secretos en Render, registrar el callback y ejecutar la prueba controlada. Instagram/Facebook continúan sin activar.

## WhatsApp autónomo y transferencia humana — 2026-08-11
- El webhook firmado de WhatsApp delega ahora en `AlmaService`: conserva idempotencia, crea/reutiliza lead y conversación, aplica automatizaciones opcionales y usa la misma memoria, calificación, agenda y seguimiento que ALMA.
- `Conversation.controlMode` separa `automated`, `handoff_requested` y `human_controlled`. ALMA solicita intervención ante una petición humana explícita o temas sensibles/reclamos, envía una confirmación, crea una tarea prioritaria y detiene nuevas respuestas automáticas.
- El CRM permite pausar ALMA manualmente, tomar una transferencia, responder por WhatsApp desde el hilo y devolver el control. El envío humano exige control humano, propiedad autenticada y un lead WhatsApp; al reanudar se completan las tareas de transferencia pendientes.
- Endpoints JWT: `PATCH /api/v1/crm/conversations/:conversationId/control` con `take|resume` y `POST /api/v1/crm/conversations/:conversationId/messages` para respuestas humanas de hasta 1.000 caracteres.
- Producción conserva `WHATSAPP_MESSAGING_MODE=mock` y `WHATSAPP_AUTO_REPLY_ENABLED=false`; no se activó tráfico real ni Instagram/Facebook. La activación oficial requiere credenciales Meta externas y una prueba controlada posterior al despliegue.
- Validación vigente: 62/62 pruebas backend, compilaciones backend/frontend y type-check frontend correctos.

## Memoria conversacional y preguntas no repetidas — 2026-08-11
- ALMA carga hasta diez intervenciones anteriores de la conversación antes de generar una respuesta IA; el comentario actual se excluye del historial duplicado.
- Gemini recibe instrucciones para usar esa memoria, no repetir preguntas ya formuladas, no solicitar datos ya entregados y hacer como máximo una pregunta breve en YouTube.
- El historial enviado se limita a mensajes de lead/ALMA y a 1.000 caracteres por intervención. Las automatizaciones fijas dejan de repetirse dentro de la misma conversación: si su respuesta exacta ya fue enviada, el flujo continúa mediante IA contextual.
- El proveedor mock también avanza entre preguntas de descubrimiento para mantener pruebas y desarrollo coherentes con el comportamiento live.
- Validación vigente: 60/60 pruebas backend y compilación TypeScript correcta.

## Priorización durable de hilos YouTube — 2026-08-11
- `YouTubeThreadCheckpoint` conserva por propietario e hilo la última revisión, último éxito, último fallo y fallos consecutivos; la rotación continúa desde MongoDB después de reinicios o despliegues.
- El poller atiende primero conversaciones cuyo último mensaje pertenece al prospecto. Dentro de cada nivel de urgencia prioriza hilos nunca revisados y luego los revisados hace más tiempo.
- Un error de lectura en un hilo ya no cancela el lote completo: se registra en su checkpoint, incrementa `threadFailures` y permite continuar con las demás conversaciones.
- La telemetría incorpora `urgentThreads` y `threadFailures`; YouTube Monitor muestra una alerta segura cuando hubo fallos aislados, sin exponer mensajes ni IDs externos.
- Validación vigente: 59/59 pruebas backend y compilaciones backend/frontend correctas; type-check frontend correcto.

## Cobertura rotativa completa de conversaciones YouTube — 2026-08-11
- El poller de respuestas construye ahora un inventario único de todos los hilos con actividad dentro de `YOUTUBE_REPLY_ACTIVE_DAYS`; se eliminó el recorte previo de `YOUTUBE_REPLY_MAX_THREADS * 3` que podía excluir conversaciones indefinidamente.
- Cada ciclo mantiene el límite de cuota `YOUTUBE_REPLY_MAX_THREADS`, pero rota por el inventario completo. La telemetría distingue hilos activos totales, hilos consultados en el ciclo y ciclos necesarios para completar una vuelta.
- YouTube Monitor también cuenta el inventario completo y conserva la estimación del retraso máximo de cobertura; un índice compuesto acelera la selección por propietario, canal, tipo y actividad.
- Validación vigente: 57/57 pruebas backend y compilación backend correcta; type-check y compilación frontend correctos.

## Recuperación de eventos YouTube interrumpidos — 2026-08-11
- `InboundEvent` registra ahora estado, intentos y ventana de reintento para comentarios de YouTube; una reclamación ya no equivale automáticamente a procesamiento completo.
- Si ALMA falla antes de crear el mensaje saliente, el evento queda `failed` y puede retomarse después de un minuto. Los eventos heredados sin salida también pueden recuperarse cuando vuelven a aparecer dentro de la ventana del poller.
- La existencia única de `OutboundMessage.sourceEventId` sigue impidiendo publicaciones dobles; el diagnóstico incorpora `processing_failed` como error de proceso separado.
- Validación vigente: 55/55 pruebas backend y compilaciones backend/frontend correctas.

## Diagnóstico visible de comentarios principales — 2026-08-11
- Configuración separa ahora el último ciclo de comentarios principales del sondeo de respuestas en hilos existentes.
- El panel muestra comentarios recibidos, candidatos posteriores al corte, procesados, inválidos, del canal propio, no elegibles y duplicados, además de los hilos devueltos y la hora de corte.
- Los datos provienen de `lastPollingSummary`; no se exponen textos, usuarios ni identificadores externos.
- Validación vigente: type-check y compilación de producción frontend correctos.

## Automatizaciones ejecutables por palabra clave — 2026-08-11
- Los comentarios y respuestas de YouTube consultan las automatizaciones activas del propietario; una coincidencia puede captar un lead nuevo aunque la palabra no sea `INFO`.
- La coincidencia exige palabras completas, ignora mayúsculas y tildes y selecciona de forma determinista la regla activa más antigua cuando varias coinciden.
- ALMA usa la respuesta configurada como salida del mismo flujo de calificación, seguimiento, conversación y reunión; no genera una segunda respuesta IA para el evento.
- `InboundEvent` y `OutboundMessage` mantienen idempotencia. Cada regla contabiliza ejecuciones totales, exitosas y fallidas, visibles en Automatizaciones.
- Validación vigente: compilaciones backend/frontend, type-check frontend y 54/54 pruebas backend.

## Buscador global y alertas funcionales — 2026-08-11
- La barra superior busca prospectos por usuario, nombre, descripción o canal y abre `/prospectos?buscar=...`; Prospectos aplica el filtro y permite limpiarlo.
- Alertas consulta las tareas CRM y muestra las pendientes ordenadas por vencimiento, con contador y acceso directo al CRM.
- Ambos controles dejaron de ser elementos decorativos y conservan navegación accesible.

## Acciones funcionales en Prospectos, Automatizaciones y Configuración — 2026-08-11
- Prospectos permite crear un lead manual, abrir sus detalles y conservar la generación de mensaje IA; las acciones dejaron de ser botones decorativos.
- Automatizaciones reemplaza datos ficticios por flujos persistidos y aislados por usuario: listar, crear una respuesta por palabra clave, pausar/reactivar y eliminar mediante `/api/v1/automations`.
- Configuración enlaza Cambiar contraseña con el formulario funcional de Perfil. Las conexiones YouTube, diagnóstico y cierre de sesión se conservan.
- Validación vigente: compilaciones backend/frontend y type-check frontend correctos.

## Lead Hunter live declarado — 2026-08-11
- Con autorización del propietario, el Blueprint cambia `YOUTUBE_HUNTER_MODE=live`; Render recibe la activación junto con el código versionado, conservando 25 búsquedas por operador y 100 por proyecto.
- La primera búsqueda real aún debe validarse desde una sesión autenticada del CRM después de que Render complete el despliegue.

## Límite ampliado y visión SaaS — 2026-08-11
- El único operador actual del CRM dispone de 25 búsquedas nuevas diarias en Lead Hunter; el proyecto conserva el tope preventivo de 100 y la caché evita consumo repetido.
- `YOUTUBE_HUNTER_USER_DAILY_SEARCH_LIMIT=25` queda explícito en ejemplos y Blueprint. Al comercializar ALMA, este límite debe migrar desde usuario hacia organización/tenant y asignarse por plan, manteniendo un presupuesto global del proyecto.
- Validación vigente: prueba enfocada Hunter 3/3 y compilación backend correcta.

## Lead Hunter oficial y Dashboard navegable — 2026-08-11
- Lead Hunter usa `search.list` y `channels.list` oficiales al activar `YOUTUBE_HUNTER_MODE=live`; permanece en mock por defecto y nunca consulta automáticamente. Busca canales o videos, filtra por suscriptores/país y limita cada página a 20 resultados.
- La cuota vigente de Google separa `search.list` en un cupo granular predeterminado de 100 búsquedas diarias; `channels.list` consume 1 unidad general. ALMA registra ambos usos, limita por proyecto y usuario, y reutiliza consultas idénticas desde caché durante seis horas.
- Las oportunidades se guardan idempotentemente por usuario/canal/video y se convierten en leads YouTube sin duplicar el mismo canal dentro del usuario. Ninguna consulta o conversión cruza propietarios.
- Dashboard incorpora accesos funcionales a Lead Hunter, YouTube Monitor, CRM y Prospectos; las tarjetas métricas y los prospectos calientes también navegan a sus vistas correspondientes.
- Variables: `YOUTUBE_HUNTER_MODE`, `YOUTUBE_HUNTER_DAILY_SEARCH_LIMIT`, `YOUTUBE_HUNTER_USER_DAILY_SEARCH_LIMIT`, `YOUTUBE_HUNTER_MAX_RESULTS` y `YOUTUBE_HUNTER_CACHE_MS`.
- Validación vigente: 51/51 pruebas backend, compilaciones backend/frontend y type-check frontend correctos.

## YouTube Monitor operativo y recuperación segura — 2026-08-11
- `/youtube-monitor` incorpora entregas diarias enviadas, fallidas y pendientes, último comentario procesado, conversaciones que superan el tiempo de respuesta y fallos clasificados como OAuth, cuota, red o API sin mostrar textos ni IDs externos.
- La cuota visible es una estimación mínima basada en respuestas confirmadas a 50 unidades; Google Cloud continúa siendo la fuente definitiva. `YOUTUBE_DAILY_QUOTA` permite reflejar el límite asignado y `YOUTUBE_RESPONSE_ALERT_MINUTES` controla la alerta de ALMA, con defaults 10.000 y 10 minutos.
- `POST /api/v1/youtube/monitor/messages/:messageId/retry` reintenta únicamente mensajes fallidos del usuario autenticado, reutiliza el registro original, espera un minuto y admite hasta tres intentos. Los timeouts y errores ambiguos se bloquean para reducir duplicados públicos.
- Validación vigente: 49/49 pruebas backend, compilaciones backend/frontend y type-check frontend correctos.

## YouTube Monitor — 2026-08-10
- Nueva ruta autenticada `/youtube-monitor` muestra hilos activos, cobertura inmediata, última actividad y salud del sondeo sin exponer textos ni IDs de YouTube.
- `GET /api/v1/youtube/monitor` reutiliza la misma ventana de actividad y prioridad por recencia que el poller; alerta si existen conversaciones fuera de capacidad.
- La cobertura sube de 5 a 8 hilos activos. Con intervalos de 2 minutos permanece en un presupuesto conservador frente a la cuota diaria predeterminada de YouTube.
- Validación vigente: 47/47 pruebas backend, compilaciones backend/frontend y type-check frontend correctos.
- Migración defensiva: valores heredados de `YOUTUBE_REPLY_MAX_THREADS` inferiores a 8 ya no reducen la cobertura operativa; el entorno aún puede ampliar el límite por encima de 8.

## Panel de autodiagnóstico operativo — 2026-08-10
- Configuración incorpora un panel autenticado con salud del poller de YouTube, actividad reciente de respuestas y estado agregado de Calendly/reuniones.
- `GET /api/v1/youtube/diagnostics` interpreta poller detenido, diferencias de identidad de canal, reservas pendientes, reuniones futuras, vencidas y fallidas.
- La credencial conserva únicamente los últimos contadores numéricos seguros; el panel no expone tokens, textos, correos ni IDs externos.
- Validación vigente: compilaciones backend/frontend correctas, type-check frontend correcto y 44/44 pruebas backend.

## Reuniones vencidas no bloquean nuevas reservas — 2026-08-10
- Una reunión `scheduled` solo se considera activa si `scheduledFor` está en el futuro; las reuniones vencidas permanecen como historial pero ya no impiden que ALMA ofrezca una nueva reserva por Calendly.
- La búsqueda prioriza la próxima reunión futura por fecha, evitando reutilizar una cita pasada como si todavía estuviera vigente.

## Telemetría del sondeo de respuestas de YouTube — 2026-08-10
- El ciclo separado de respuestas registra ahora candidatos salientes, hilos activos, páginas y respuestas recuperadas, además de los mismos desenlaces seguros de procesamiento usados para comentarios principales.
- `YouTube reply polling summary` no expone texto, usuarios ni IDs y permite verificar si una continuación conversacional llega desde YouTube y si ALMA la procesa o la descarta.

## Telemetría de filtros del poller de YouTube — 2026-08-10
- Cada credencial registra ahora un resumen seguro por ciclo con hilos recibidos, comentarios principales, corte temporal, candidatos posteriores al corte y resultados `processed`, `invalid`, `own_channel`, `not_eligible` y `duplicate`.
- El resumen no incluye texto de comentarios, tokens, `userId` ni identificadores de canales; permite localizar el filtro exacto que impide una ingesta sin exponer datos personales.
- `processComment` devuelve un resultado tipado para alimentar los contadores sin alterar la idempotencia ni el flujo CRM/ALMA.
- Validación vigente: compilación TypeScript correcta y 41/41 pruebas backend.

## Diagnóstico y exclusión mutua del poller de YouTube — 2026-08-10
- Una prueba real publicó `INFO ALMA` desde un canal externo, pero la respuesta no apareció durante la ventana inicial de observación; el backend continuó respondiendo `200` y la conexión OAuth figuró activa.
- `startYouTubePolling` impide ahora ciclos simultáneos, normaliza el intervalo a un mínimo de 60 segundos y registra inicio, finalización, cantidad de credenciales y errores sin exponer tokens.
- Esta telemetría permite distinguir en Render entre modo inactivo, cero credenciales, errores OAuth/API y ciclos saludables.
- Validación vigente: compilación TypeScript correcta y 40/40 pruebas backend.

## Sincronización Calendly Free por polling — 2026-08-09
- El plan gratuito rechazó la suscripción webhook con `403`; no se realizó ninguna compra ni cambio de plan.
- `CalendlyPollingService` consulta cada 2 minutos los eventos e invitados del usuario mediante la API v2 y `CALENDLY_PERSONAL_ACCESS_TOKEN`, que permanece externo al repositorio.
- El `utm_content` aleatorio enlaza cada invitado con su `Meeting`; reservas y cancelaciones actualizan reunión, tareas y actividades con idempotencia.
- Las reprogramaciones priorizan el invitado activo frente al registro cancelado anterior. El poller impide ejecuciones simultáneas y revisa desde 24 horas atrás hasta 90 días adelante.
- Variables: `CALENDLY_PERSONAL_ACCESS_TOKEN`, `CALENDLY_POLL_INTERVAL_MS`, `CALENDLY_LOOKAHEAD_DAYS` y `CALENDLY_TIMEOUT_MS`.
- Validación vigente: compilación TypeScript correcta y 5/5 pruebas enfocadas de Calendly.

## Agenda segura con Calendly — 2026-08-09
- Cuenta Calendly configurada: Google Calendar reconectado, zona `America/Bogota` y disponibilidad de lunes a viernes de `19:30` a `20:30`.
- Evento público activo: `Reunión de descubrimiento con ALMA`, duración 30 minutos, ubicación Zoom y URL `https://calendly.com/josefernandodiazasesoria/new-meetingreunion-de-descubrimiento-con-alma`.
- `SCHEDULING_MODE=calendly` hace que ALMA ofrezca la disponibilidad configurada en Calendly en vez de aceptar una hora arbitraria y crear Zoom directamente.
- Cada solicitud crea una reunión `pending_booking` con un token aleatorio enviado como `utm_content`; el webhook firmado de Calendly la cambia a `scheduled` o `cancelled` y sincroniza tareas/actividades CRM.
- Para la cuenta interna con token personal, el webhook también admite `CALENDLY_WEBHOOK_SECRET` en la URL y lo compara en tiempo constante; la firma HMAC continúa disponible para una futura aplicación OAuth pública.
- Las respuestas públicas de YouTube nunca incluyen `joinUrl`; el enlace particular de Zoom queda únicamente en el CRM autenticado y en las confirmaciones privadas de Calendly.
- Render declara las credenciales de Calendly como valores externos; el webhook queda disponible para una futura cuenta de pago, mientras producción gratuita usa polling.
- Suite vigente: 37/37 pruebas backend y compilación TypeScript correcta.

## Hora local correcta en Zoom — 2026-08-08
- `ZoomProvider` envía `start_time` como hora local sin sufijo UTC junto con la zona IANA solicitada.
- Se evita aplicar dos veces el desplazamiento horario; `10:00 America/Bogota` ya no aparece como `15:00` en Zoom.
- `scheduledFor` conserva internamente el instante UTC validado por el orquestador.

## Reintento de reuniones mock al activar Zoom — 2026-08-08
- Si una conversación conserva una reunión `pending_configuration` y producción usa `ZOOM_MODE=live`, una nueva intención de agenda reutiliza sus datos y reintenta la creación real en Zoom.
- En modo mock se conserva la respuesta pendiente sin duplicar reuniones, actividades ni tareas.
- La cancelación ahora también alcanza reuniones `pending_configuration`, permitiendo cerrar borradores antiguos desde la conversación.

## Healthcheck estable para el poller — 2026-08-08
- `/health` se registra antes de `generalLimiter`; los sondeos internos de Render ya no consumen el cupo general ni reciben `429`.
- Esto evita reinicios periódicos de la instancia que interrumpían el poller de YouTube.
- Una prueba de integración verifica 105 healthchecks consecutivos con respuesta `200`.

## Zoom live en producción — 2026-08-08
- La aplicación Server-to-Server OAuth `ALMA Prospectación` está activa en Zoom Marketplace con el alcance mínimo para crear reuniones.
- Render almacena externamente `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET` y `ZOOM_USER_ID`; ningun secreto se guarda en el repositorio.
- Producción usa `ZOOM_MODE=live`, el Blueprint conserva ese modo y el backend desplegado responde correctamente en `/health`.
- Pendiente: validar una nueva solicitud conversacional real y confirmar `Meeting.status=scheduled` con `externalId` y `joinUrl`.

## Privacidad de agenda en YouTube — 2026-08-08
- La orquestación de reuniones no solicita correo en comentarios públicos de YouTube; utiliza internamente `youtube:<leadId>` como identificador de contacto y recopila solo fecha, hora y zona horaria.
- Los demás canales conservan la recopilación progresiva de correo cuando corresponda.
- Validación real completada con un prospecto externo: ALMA calificó, mantuvo la conversación en el hilo y registró una reunión para `2026-08-09 10:00 America/Bogota`, pendiente de confirmación porque Zoom continúa en modo mock.

## Conversación continua en hilos de YouTube — 2026-08-08
- El poller consulta las respuestas de hasta 5 hilos recientes con actividad saliente de ALMA, cada 2 minutos y durante una ventana configurable de 7 días.
- Cada respuesta entrante conserva como destino el comentario raíz para que ALMA continúe en el mismo hilo; `InboundEvent` mantiene la idempotencia por ID de comentario.
- Los comentarios y respuestas del propio canal se descartan para impedir bucles de autorrespuesta. Los límites `YOUTUBE_REPLY_POLL_INTERVAL_MS`, `YOUTUBE_REPLY_ACTIVE_DAYS` y `YOUTUBE_REPLY_MAX_THREADS` controlan la cuota.

## YouTube live persistente en Render — 2026-08-08
- El Blueprint fija `YOUTUBE_INGESTION_MODE=live` y `YOUTUBE_MESSAGING_MODE=live`; así los despliegues posteriores no revierten accidentalmente la integración activa a `mock`.
- Las credenciales OAuth y secretos continúan siendo variables externas de Render y no se almacenan en el repositorio.
- Validación real completada con un comentario principal `INFO ALMA`: ALMA lo ingirió y publicó como respuesta oficial en YouTube `¡Hola! Soy ALMA. Gracias por escribir INFO. Para orientarte mejor, ¿qué resultado buscas conseguir?`.

## YouTube live y tolerancia de ingesta — 2026-08-08
- Google Cloud autoriza el callback público de Render y producción tiene `YOUTUBE_INGESTION_MODE=live` y `YOUTUBE_MESSAGING_MODE=live` con secretos almacenados en Render.
- El canal `100 % Mentalmente` aparece conectado mediante OAuth y el backend desplegado inicia correctamente en modo live.
- El cursor del poller relee por defecto los últimos 60 minutos (`YOUTUBE_POLL_OVERLAP_MS`) sin retroceder antes de `connectedAt`; la idempotencia de `InboundEvent` evita duplicados y cubre retrasos de consistencia de YouTube y despliegues gratuitos.
- El recorrido comentario principal `INFO` → ingesta → ALMA → respuesta oficial quedó verificado en producción; continúa la validación de calificación, seguimiento y Zoom.

## ALMA pública en Internet — 2026-08-07
- Backend `https://alma-backend-9eo1.onrender.com` está Live en Render Free; `/health` responde `{"success":true,"status":"ok"}`.
- Frontend `https://prospectacion-ai.vercel.app` está publicado en Vercel desde `main`, con `VITE_API_URL` apuntando a Render.
- Se verificó el flujo real registro web → API Render → MongoDB Atlas → JWT → dashboard.
- Atlas autoriza únicamente los rangos salientes compartidos de Render `74.220.48.0/24` y `74.220.56.0/24`; la aplicación usa un usuario dedicado con `readWrite` solo sobre `prospectacion-ai`.
- Producción permanece segura en mock para YouTube, IA, Zoom, Instagram y WhatsApp; activar YouTube live sigue requiriendo credenciales OAuth de Google Cloud.

## YouTube OAuth e ingesta — 2026-08-07
- Configuración incluye una tarjeta de YouTube con estado del canal, inicio OAuth y desconexión protegida por confirmación.
- YouTube usa OAuth 2.0 web por usuario mediante `/api/v1/youtube/oauth/connect` y callback firmado; ya no requiere un access token estático para operar en live.
- `YouTubeCredential` cifra access/refresh tokens con AES-256-GCM y una clave externa de 32 bytes; el access token se renueva automáticamente antes de expirar.
- `YOUTUBE_INGESTION_MODE=mock|live` controla el poller de `commentThreads.list`. El primer enlace parte desde el momento de conexión y cada comentario queda protegido por idempotencia en `InboundEvent`.
- Un comentario nuevo con `INFO` crea/reutiliza el lead YouTube, abre la conversación, ejecuta ALMA y responde mediante `comments.insert`.
- Activación live pendiente de crear las credenciales en Google Cloud, registrar el redirect URI y completar consentimiento desde una sesión autenticada.
- Suite vigente: 29/29 pruebas backend.

## Despliegue gratuito en Render — 2026-08-07
- El servicio web del Blueprint declara `plan: free`; omitirlo hace que Render seleccione `starter` y solicite información de pago.
- El primer despliegue permanece en mock y no requiere registrar tarjeta para crear una instancia web gratuita.
- `backend/package-lock.json` está sincronizado con npm 10; incluye el peer opcional `gcp-metadata` que Render exige para ejecutar `npm ci` con Node 20.
- El backend compila con TypeScript 5.9 usando `module` y `moduleResolution` en `Node16`; la resolución heredada `node10` ya no es admitida por esa versión.
- El build de Render usa `npm ci --include=dev` porque `NODE_ENV=production` omite por defecto TypeScript y las declaraciones `@types` requeridas para compilar; el runtime continúa ejecutando únicamente `dist/index.js`.

## Preparación de despliegue — 2026-08-06
- `render.yaml` define el backend Node en Render con `/health`, MongoDB Atlas y todos los proveedores externos en `mock` para el primer despliegue.
- `frontend/vercel.json` configura Vite y el fallback SPA para que las rutas React funcionen al recargar en Vercel.
- Los Dockerfiles excluyen credenciales, dependencias y artefactos locales; el healthcheck backend respeta el `PORT` asignado por la plataforma.
- `docs/DEPLOYMENT.md` contiene el orden Atlas → Render → Vercel, las variables secretas y la verificación segura.
- No se activa YouTube live: OAuth, refresh token cifrado e ingesta incremental siguen siendo el próximo bloque.

## Base YouTube — 2026-08-06
- Hunter y dashboard usan YouTube como canal/default visible; se retiraron referencias promocionales de Instagram/WhatsApp de esas pantallas y los ejemplos generales de API/desarrollo usan `platform: youtube`.
- `MessagingProvider` admite `youtube_comment`; `YouTubeMessagingProvider` prepara respuestas oficiales con `comments.insert`, mientras `YOUTUBE_MESSAGING_MODE=mock` es el valor predeterminado sin red.
- `InboundEvent` y `OutboundMessage` aceptan canal YouTube; los mensajes salientes distinguen `youtube_reply` y proveedor `youtube`.
- El modo live requiere `YOUTUBE_ACCESS_TOKEN`, pero no debe activarse hasta completar OAuth 2.0 de servidor web y almacenamiento seguro de refresh token. YouTube Data API no admite cuentas de servicio para un canal normal.
- Pendiente: ingesta periódica con `commentThreads.list`, OAuth completo y orquestación de comentarios `INFO` hacia ALMA.
- Suite vigente: 26/26 pruebas backend.

## Robustez local de ALMA — 2026-08-06
- `AI_MODE=mock|live` controla el proveedor de IA de forma explícita; `mock` prevalece aunque exista una clave local y evita llamadas accidentales. Sin variable se conserva la selección heredada por presencia de `GEMINI_API_KEY`.
- El backend valida al iniciar que `AI_MODE=live` tenga clave Gemini y que `CRM_OWNER_ID` sea un ObjectId de 24 caracteres correspondiente a un usuario real.
- Los seguimientos abiertos ahora usan `upsertPendingFollowUp`: mensajes posteriores actualizan la misma tarea pendiente por conversación en lugar de crear duplicados.
- Suite vigente: 22/22 pruebas backend.

## Directriz de canal — 2026-08-06
- YouTube es el canal principal vigente de ALMA para producto, CTA, enlaces, botones, textos y contenido nuevo.
- No proponer publicaciones, cuentas, automatizaciones ni estrategias para Instagram/Facebook, ni mecanismos para evadir restricciones de Meta.
- Las integraciones Meta existentes se conservan únicamente como compatibilidad técnica oficial, desactivables y en mock por defecto donde corresponda.
- Antes de modificar referencias históricas de Instagram/Facebook fuera de la arquitectura `MessagingProvider`, informar al usuario.

## Consolidación de MessagingProvider — 2026-08-06
- `MetaMessagingProvider` centraliza los transportes oficiales de Instagram y WhatsApp; ningún controlador realiza llamadas directas a Graph API.
- `MessagingService` selecciona canal/proveedor, persiste `OutboundMessage` e idempotencia, y soporta `private_reply`, `direct_message` y `whatsapp_message`.
- WhatsApp conserva firma HMAC, ruta y modo de auto-respuesta, ahora con idempotencia `InboundEvent`. Se corrigió la referencia estática de validación que fallaba al ser invocada por Express.
- Se eliminó el controlador WhatsApp duplicado y sin firma que estaba provisionalmente dentro de `GeminiService`; la generación Gemini queda enfocada solo en IA.
- `INSTAGRAM_MESSAGING_MODE` es el nombre explícito preferido, con compatibilidad para `META_MESSAGING_MODE`; WhatsApp usa `WHATSAPP_MESSAGING_MODE`.
- Hunter/frontend y datos históricos de Instagram/Facebook no fueron modificados en esta consolidación.

## Actualización técnica — 2026-08-06 (orquestación de reuniones)
- `MeetingOrchestratorService` mantiene un único borrador de reunión por conversación y recopila progresivamente correo, fecha, hora y ciudad/zona IANA.
- ALMA pide solamente los campos faltantes, acepta fechas ISO o `DD/MM/YYYY`, horas de 12/24 horas y la expresión `mañana`, y rechaza fechas pasadas o calendarios inválidos.
- Zoom se invoca únicamente al completar datos válidos. Mock pasa a `pending_configuration`; live pasa a `scheduled`; fallos quedan persistidos sin interrumpir Instagram.
- Solicitudes repetidas no duplican una reunión ya programada o pendiente de configuración; la cancelación conversacional cambia el estado a `cancelled`.
- Suite vigente: 17/17 pruebas backend.

## Actualización técnica — 2026-08-06 (Zoom)
- `ZoomProvider` ya implementa Server-to-Server OAuth con `account_credentials`, caché del token y creación real mediante `/v2/users/{ZOOM_USER_ID}/meetings`.
- `ZOOM_MODE=mock|live` selecciona el proveedor. El modo live exige cuenta, cliente, secreto y usuario anfitrión; timeout y duración son configurables.
- Los errores de OAuth/API se normalizan y persisten en `Meeting` sin registrar secretos ni impedir que ALMA envíe su respuesta por Instagram.
- El mock permanece como comportamiento predeterminado y conserva reuniones `pending_configuration` sin tráfico externo.
- Suite vigente: 14/14 pruebas backend, incluidas OAuth, caché, creación, autenticación, timeout, respuesta inválida y flujo mock.

## Actualización técnica — 2026-08-06
- ALMA envía respuestas salientes mediante la abstracción `MessagingProvider`; `MockMessagingProvider` conserva el desarrollo/E2E sin red y `MetaMessagingProvider` deja preparada la Graph API oficial.
- Los comentarios `INFO` usan `recipient.comment_id`; las respuestas posteriores de Instagram Direct usan el Instagram-scoped ID en `recipient.id`.
- Cada intento se persiste en `OutboundMessage` con estado, proveedor, destinatario, IDs externos, fechas, error sanitizado y clave única `sourceEventId` para idempotencia.
- `META_MESSAGING_MODE=mock|live` controla la entrega. El modo `live` exige `META_ACCESS_TOKEN` y `META_IG_USER_ID`; la versión y timeout son configurables.
- Zoom real quedó implementado y preparado para activación mediante credenciales Server-to-Server OAuth.

## Actualización técnica — 2026-08-03
- `backend/src/index.ts` es la única entrada canónica; los otros inicios son shims de compatibilidad sin lógica propia.
- Las pruebas de autenticación usan MongoDB efímero y ya no pueden ejecutar `dropDatabase()` sobre el `MONGO_URI` configurado.
- Se añadió el webhook `/api/v1/meta/webhook`, validación HMAC, idempotencia de eventos y captura de comentarios con la palabra `INFO`.
- El evento crea el lead de Instagram y abre/registra su conversación en MongoDB.
- La respuesta privada oficial de Instagram quedó implementada y preparada para activación con credenciales; Zoom real continúa pendiente.
- ALMA ya procesa mensajes posteriores al `INFO`, asigna score/estado/interés, programa seguimiento a 24 horas y registra actividades CRM.
- Las solicitudes de reunión crean un registro Zoom `pending_configuration` cuando no hay credenciales, sin efectuar llamadas externas.
- API CRM inicial: `/api/v1/crm/conversations`, `/activities` y `/meetings` (JWT).
- `frontend/src/pages/CrmPage.tsx` quedó conectado a actividades y reuniones persistidas.
- Integraciones desacopladas mediante `AIProvider` y `MeetingProvider`; Gemini y Zoom usan implementaciones mock cuando faltan credenciales o `ZOOM_MODE` no es `live`.
- `META_MOCK_MODE=true` junto al encabezado `X-ALMA-MOCK-EVENT: true` permite probar POST `/api/v1/meta/webhook` solo fuera de producción.
- Suite E2E local: 3/3 pruebas pasan con MongoDB Memory Server como dependencia exclusiva de desarrollo.

## Actualización técnica — 2026-07-30
- Se consolidó la API activa en `backend/src/app.ts` y `backend/src/index.ts`.
- Se protegieron las rutas de leads e IA con JWT y rate limit, y se alinearon los prefijos de Hunter/Scraper del frontend.
- Se añadieron healthcheck, Helmet, CORS configurable, builds reproducibles y configuración ESLint por proyecto.
- La integración WhatsApp ahora exige firma de Meta y no responde automáticamente salvo habilitación explícita.
- Pendiente: organizaciones, refresh tokens, validación DTO completa, conversaciones, automatizaciones ejecutables e integraciones oficiales por canal.

## Objetivo
Este archivo define las reglas principales para trabajar con el proyecto `prospectacion-ai` y actúa como memoria persistente del repositorio.

## Reglas de comportamiento
1. Antes de cualquier tarea futura, leer primero:
   - `AGENTS.md`
   - `docs/ai/README.md`
2. Cada vez que se haga un cambio relevante en el proyecto, actualizar estos archivos:
   - `AGENTS.md`
   - `docs/ai/README.md`
   - Opcional: otros archivos en `docs/ai/`
3. Mantener la documentación técnica resumida, clara y sincronizada con el código.
4. Documentar:
   - arquitectura
   - componentes
   - tecnologías
   - flujo del sistema
   - reglas de diseño
   - estado actual
   - pendientes

## Estructura del proyecto
- `frontend/` — aplicación React + TypeScript + TailwindCSS
- `backend/` — API Node.js + Express + MongoDB
- `docs/` — documentación general
- `docs/ai/` — documentación técnica resumida y de referencia rápida

## Prioridades del proyecto
- Mejorar la experiencia visual del frontend con UI SaaS moderna
- Mantener la arquitectura clara entre frontend/backend
- Documentar todos los cambios en tiempo real
- Usar `framer-motion` e `lucide-react` para UI profesional
- Mantener Tailwind responsive y limpio

## Cómo usar esta memoria persistente
- Si agregas o modificas componentes, describe el cambio en `docs/ai/README.md`
- Si cambias rutas o flujos, actualiza las secciones de arquitectura y flujo
- Si cambias dependencias importantes, añade notas de estado en ambos archivos

## Estado actual (resumen rápido)
- Frontend modernizado con animaciones, dark mode, sidebar y navbar fija
- Dashboard actualizado con tarjetas estadísticas y gráficos `recharts`
- `lucide-react` instalado y usado en UI
- `framer-motion` usado para transiciones suaves
- `npm run type-check` pasa sin errores

## Pendientes generales
- Documentación de API y endpoints faltantes
- Pruebas unitarias e integración en frontend/backend
- Mejoras de seguridad y validación de inputs
- Soporte de WebSockets / notificaciones en tiempo real
- Actualizar `docs/ai/` tras cada cambio mayor en el proyecto
