# AGENTS.md

## Lanzamientos L6F consolidado: TikTok mock/inbound — 2026-08-22
- El soporte TikTok real continúa limitado a un boundary normalizador y una ingesta inyectable, desactivada por defecto; no existe transporte oficial configurado, provider outbound ni capacidad DM verificable. L6F implementa únicamente comentarios fixture sobre contenido propio.
- `LaunchTikTokContent` relaciona owner, lanzamiento, cuenta y contentId de forma explícita e inactivable. El adaptador no correlaciona por texto, INFO, hashtag, intención o IA; contenido no mapeado, cuenta ausente y lead no participante quedan en `pending_review`.
- Los comentarios son evidencia débil y nunca registran, confirman, marcan asistencia ni crean reuniones. Lanzamientos terminales y participantes cancelados quedan `ignored`; el opt-out central rechaza el lead, conserva el canal e invalida acciones aplicables.
- TikTok sigue completamente OFF: `TIKTOK_API_APPROVED=false`, ingesta/mensajería false, cero `OutboundMessage`, cero `MessagingService` y ningún API outbound. Validación vigente: L6F 13/13, TikTok conjunto 22/22, Lanzamientos 157/157, backend 535/535; build correcto y lint sin errores.

## Lanzamientos L6E consolidado: YouTube mock/inbound — 2026-08-22
- La ingesta existente de `YouTubeIngestionService` proyecta comentarios y respuestas de videos asociados hacia `LaunchExternalEvent`; el mapping video/canal/cuenta/lanzamiento es explícito, owner-scoped e inactivable.
- Los comentarios son siempre evidencia débil: no registran, confirman ni marcan asistencia. Los hilos solo heredan asociación desde una raíz ya relacionada para el mismo owner y cuenta; los casos sin evidencia determinista quedan en `pending_review`.
- Un evento vinculado a Lanzamientos termina antes de ALMA/mensajería. El opt-out explícito rechaza el lead, aplica el opt-out central, invalida propuestas/acciones y actualiza participantes sin migrar de canal.
- YouTube permanece en mock/inbound: cero `OutboundMessage`, cero `MessagingService` y cero API outbound en L6E. Validación vigente: L6E 13/13, ingesta conjunta 25/25, Lanzamientos 144/144 y backend 522/522; build correcto y lint sin errores.

## Lanzamientos L6D consolidado: adaptador WhatsApp mock/inbound — 2026-08-22
- El webhook WhatsApp oficial continúa como único punto de entrada y conserva firma HMAC, `phone_number_id`, allowlist, timestamp/replay, respuesta HTTP previa al procesamiento, `InboundEvent`, reintentos e idempotencia. No se creó otro webhook.
- `WhatsAppInboundNormalizer` reconoce texto, button reply, list reply y metadata segura de imagen/audio/video/documento. Los estados delivery/read continúan ignorados porque el flujo existente no los procesa como mensajes. Nunca descarga medios ni persiste tokens interactivos.
- `WhatsAppLaunchAdapter` proyecta hacia `LaunchExternalEvent`. La asociación exige token opaco con launchId o una única conversación ya vinculada; INFO, “sí”, intención, IA, nombres y texto visible de controles no correlacionan lanzamientos.
- Los controles usan `alma-launch:v1:<registration|confirmation|interaction>:<launchId>:<token>` y validan owner, hash del token, participante, launch vigente y `registrationConfig.whatsappInteractiveActions`. Solo registration/confirmation explícitamente autorizados generan hechos L3; el resto queda `pending_review`.
- Texto, media e interacciones generales son eventos débiles y nunca registran, confirman, marcan asistencia ni crean reuniones. Opt-out, lanzamiento terminal y participante cancelado quedan `ignored` por políticas centrales.
- `WhatsAppOptOutService` persiste rechazo/tag `opt_out`, aplica opt-out general a identidades confirmadas, invalida propuestas/tareas/acciones multicanal y transiciona participantes activos a `stage.opted_out`. El mensaje de opt-out no genera una nueva propuesta.
- WhatsApp permanece seguro: `WHATSAPP_MESSAGING_MODE` usa default mock, `WHATSAPP_AUTO_REPLY_ENABLED` default false y `WHATSAPP_REPLY_MODE` assisted. L6D no importa mensajería, no crea `OutboundMessage` y no llama Cloud API.
- Validación vigente: L6D 13/13, L6D + webhook histórico 27/27, L1–L6D 131/131, backend 509/509, build correcto y lint sin errores (559 advertencias permitidas). Frontend no fue modificado.

## Lanzamientos L6C consolidado: adaptador Meta mock/inbound — 2026-08-22
- El webhook Meta existente continúa siendo el único punto de entrada y conserva firma HMAC, respuesta rápida, normalización e idempotencia `InboundEvent`. `MetaIngestionService` proyecta después cada evento aceptado mediante `MetaLaunchAdapter` hacia `LaunchExternalEvent`, sin bloquear ni reemplazar el flujo CRM/asistido de Fase 4.
- `LaunchMetaContent` relaciona de forma owner-scoped e idempotente lanzamiento, Instagram/Facebook, cuenta/página y contenido externo. El CRM autenticado permite listar, vincular y desactivar mapeos; un contenido no puede reasignarse silenciosamente a otro lanzamiento.
- El adaptador distingue comentarios Instagram/Facebook, DM Instagram, Messenger y contexto de private reply. Conserva IDs mínimos, timestamp, plataforma, cuenta, contenido y hash del texto; nunca persiste el payload Meta completo en Lanzamientos.
- La asociación exige contenido previamente mapeado, token opaco explícito o una única conversación ya vinculada. Una identidad multicanal solo se reutiliza si `ContactIdentity` está confirmada/activa. INFO, intención, IA, nombres y similitud no participan en la asociación.
- Comentarios y DM son eventos débiles: permanecen `pending_review` aun con asociación determinista y nunca registran, confirman, marcan asistencia ni crean reuniones. Opt-out y lanzamientos/participantes no vigentes quedan `ignored`.
- Replay se limita con `META_INBOUND_MAX_AGE_MS`; L6A conserva fingerprint, claves únicas, concurrencia y recuperación. Fixtures cubren Instagram, Facebook, Messenger, private reply, post mapeado/no mapeado, token, identidad, owner, duplicados y firma.
- Meta permanece mock: `META_MESSAGING_MODE=mock`, `INSTAGRAM_MESSAGING_MODE=mock` y Facebook hereda mock. L6C no importa `MessagingService`, no crea `OutboundMessage` y no llama Graph API.
- Validación vigente: L6C 15/15, L1–L6C 118/118, backend 496/496, build correcto y lint sin errores (551 advertencias permitidas). Frontend no fue modificado.

## Lanzamientos L6B consolidado: formulario/webhook firmado inbound — 2026-08-22
- `POST /api/v1/launches/inbound/form/webhook` recibe exclusivamente JSON raw con HMAC SHA-256 sobre `timestamp.cuerpo`, secreto/owner externos, tolerancia de 30–900 segundos, límite de 1–256 KiB, rate limit de 30/minuto e idempotency key consistente entre header y DTO.
- El DTO v1 cerrado admite interés, registro o confirmación y una sola referencia determinista: `participantId`, `leadId` owner-scoped o token opaco previamente generado, que se persiste únicamente como SHA-256. No acepta owner, nombres, email/teléfono aproximado, texto libre ni objetos arbitrarios.
- `LaunchExternalEvent` conserva fingerprint canónico. Reenvíos exactos y concurrentes reutilizan el evento; el mismo eventId o idempotency key con otro contenido devuelve conflicto. Fallos quedan reintentables y una reclamación vencida puede recuperarse.
- La asociación verifica lanzamiento, participante, lead, conversación y propietario. Interés queda en `pending_review`; confirmación exige formulario autorizado y registro previo. Lanzamientos no vigentes, opt-out y participantes cancelados quedan `ignored` sin mutación.
- La evidencia L3 minimizada conserva provider, externalEventId, timestamp, método, formId, referencia y metadata permitida. Nunca persiste cuerpo raw, token, firma ni secreto. La observabilidad registra solo provider, eventId, launch, estado, intentos, latencia y errores sanitizados.
- L6B no importa mensajería, no crea `OutboundMessage`, tareas o propuestas y no invoca proveedores. Sin `LAUNCH_FORM_WEBHOOK_SECRET` y `LAUNCH_FORM_WEBHOOK_OWNER_ID` responde 503; ninguna credencial real fue configurada.
- Validación vigente: L6A+L6B 34/34, L1–L6B 103/103, backend 481/481, build correcto y lint sin errores (541 advertencias permitidas). Frontend no fue modificado.

## Lanzamientos L6A consolidado: contratos e ingesta externa segura — 2026-08-22
- `LaunchExternalEvent` funciona como inbox durable, versionado, owner-scoped e idempotente para Meta, WhatsApp, YouTube, TikTok, formularios, proveedores de eventos y fixtures locales.
- El contrato normaliza proveedor, tipo, canal, identificadores, instante, evidencia mínima y referencias explícitas. Rechaza versiones inválidas, eventos vencidos, verificación insuficiente y metadatos fuera de límites; incluye verificación HMAC reutilizable sin persistir secretos.
- La asociación exige `launchId` y `participantId` explícitos y verifica propietario, lanzamiento, participante, lead y conversación. Nunca enlaza por nombre, texto, usuario social ni heurísticas; los eventos ambiguos o débiles quedan en `pending_review`.
- Registro, confirmación, asistencia y no-show reutilizan exclusivamente `LaunchOperationsService`. La reclamación atómica, claves únicas, reintentos y recuperación de reclamaciones vencidas evitan doble aplicación y conservan errores auditables.
- Los adaptadores L6A son fixtures/mock; no hay endpoint público, polling ni integración live. TikTok conserva su canal sin inventar destinatarios. L6A no importa `MessagingService`, no crea `OutboundMessage` y no envía nada.
- Validación vigente: L1–L6A 87/87, backend 465/465, build correcto y lint sin errores (537 advertencias permitidas). Frontend no fue modificado.

## Prueba operativa integral Lanzamientos L1–L5 — 2026-08-22
- `launch-operational-e2e.test.ts` recorre en MongoDB efímero un `Lanzamiento Demo ALMA` con 13 leads ficticios, AND/OR, selección/exclusión, opt-out, evidencia L3, reunión, acciones pre/postevento, tareas, propuestas, invalidación, auditoría, métricas, concurrencia/idempotencia y aislamiento por owner.
- WhatsApp, Instagram, Facebook, YouTube y TikTok se prueban con IA/mensajería en mock o desactivada. TikTok permanece como canal reconocido, sin destinatario inventado ni propuesta outbound.
- Instrumentación explícita confirmó 0 `OutboundMessage`, 0 llamadas a `MessagingService`, 0 llamadas a Meta y 0 llamadas a YouTube. No se usaron credenciales, staging ni datos reales.
- Validación final: Lanzamientos 69/69, backend 447/447, frontend 10/10, builds correctos y lint sin errores. La ruta local `/lanzamientos` redirige a autenticación sin sesión; sus flujos internos pasan las pruebas React automatizadas.

## Lanzamientos L5 consolidado: CRM/frontend operativo — 2026-08-22
- `/lanzamientos` ofrece listado filtrable, métricas reales, creación/edición, lifecycle validado, segmentación simple AND/OR con preview y confirmación humana, participantes, operación L3, acciones L4 y auditoría.
- La capa `LaunchCrmService` agrega lecturas owner-scoped de lanzamientos, participantes enriquecidos, reuniones, identidad/consentimiento, acciones, tareas, propuestas y eventos. La edición de configuración es validada, idempotente, auditable y usa control optimista.
- Registro, confirmación, asistencia y correcciones siguen pasando por los contratos de evidencia L3. Segmentación reutiliza L2 y permite exclusión manual; las señales de opt-out, canal bloqueado/preferido, estados terminales e invalidaciones permanecen visibles.
- Las propuestas se editan, descartan o aprueban usando el CRM existente. El envío solo puede iniciarse mediante acción y confirmación humana explícitas; L5 no crea `OutboundMessage`, workers, proveedores ni automatizaciones.
- Validación vigente: backend 446/446 y frontend 10/10; builds backend/frontend correctos; lint sin errores (526 advertencias backend y 65 frontend permitidas). Un timeout aislado preexistente de Perfil pasó al repetirlo y la suite completa posterior quedó verde.

## Lanzamientos L4 consolidado: acciones asistidas — 2026-08-22
- `LaunchAction` materializa de forma durable e idempotente invitaciones, recordatorios, acciones previas y posteriores al evento, recuperación no-show y siguientes pasos a partir de evidencia explícita de `LaunchParticipant`.
- El worker existente de automatizaciones reclama, reintenta y recupera acciones; reutiliza políticas de seguimiento, identidad multicanal, tareas, reuniones y propuestas sin crear schedulers ni proveedores paralelos.
- Cada ejecución revalida lanzamiento, participante, conversación, reunión, canal, consentimiento, cooldown, límites y TTL. Los cambios posteriores cancelan o reemplazan acciones y propuestas con auditoría en `LaunchEvent`.
- Las acciones siempre son asistidas: generan tarea y, solo con conversación y destinatario seguros en WhatsApp/Instagram/Facebook, una `AssistedProposal` editable; nunca invocan `MessagingService` ni crean `OutboundMessage` automáticamente.
- Validación vigente: L1–L4 66/66, backend 444/444, compilación correcta y lint sin errores (511 advertencias permitidas). Frontend no fue modificado en L4.

## Lanzamientos L3 consolidado: registro y asistencia operativa — 2026-08-22
- `LaunchOperationsService` registra hechos operativos owner-scoped para registro, confirmación, asistencia, no-show, correcciones, importación controlada, métricas y vínculo explícito con reuniones. No existen inferencias desde comentarios, mensajes, score ni paso del tiempo.
- La evidencia L1 se amplió de forma compatible con `source`, canal, referencia, actor, fecha y metadata escalar limitada; fuentes externas/sistema requieren referencia. Registro, confirmación, attended y no-show conservan evidencias independientes.
- La confirmación exige registro por defecto. Solo una política explícita `registrationConfig.requireRegistrationForConfirmation=false` permite confirmación sin registro y deja razón auditada. Asistencia permanece `unknown` hasta evidencia; volver a unknown requiere corrección humana con motivo y evento adicional.
- Importaciones internas admiten hasta 100 hechos, resultados parciales e idempotencia por ítem. Métricas derivadas: seleccionados, registrados, confirmados, attended, notAttended y unknown, sin conversiones inferidas.
- La deduplicación multicanal ahora reconcilia participantes creados antes de confirmar el vínculo entre identidades; no fusiona leads ni autoasocia identidades. Reuniones solo se vinculan si ya existen y pertenecen al mismo lead/owner.
- Endpoints autenticados mínimos consultan/registran/corrigen hechos, importan lotes, obtienen métricas y vinculan reuniones. No se añadieron frontend, workers, IA, propuestas ni mensajería.
- Validación vigente: L1+L2+L3 50/50, backend 428/428, build backend correcto y lint backend sin errores. `OutboundMessage` permanece en cero en las pruebas L3.

## Lanzamientos L2 consolidado: segmentación y selección asistida — 2026-08-22
- `targetSegment` usa un contrato cerrado `schemaVersion=1` con campos/operadores permitidos, lógica AND/OR, grupos anidados hasta profundidad 3, máximo 30 reglas y 10 grupos; no acepta consultas Mongo, código ni expresiones arbitrarias.
- `LaunchSegmentVersion` conserva snapshots inmutables, hash, actor, razón y versión. El motor evalúa datos estructurados de Lead, historial de calificación, reuniones, participación previa e identidad multicanal sin IA y devuelve razones deterministas por regla y exclusión.
- El preview es paginado (máximo 100), carga relaciones por lotes, presenta elegibilidad, razones, alertas de posibles duplicados y distribuciones, y nunca crea participantes. Opt-out, estados terminales, canales bloqueados/no permitidos y reuniones activas son exclusiones no omitibles en la selección por segmento.
- La confirmación humana crea `LaunchParticipant` idempotente con snapshot de versión/hash/razones. Exclusiones manuales y overrides permitidos exigen actor y motivo; la selección manual directa permanece separada y reutiliza las invariantes L1.
- Endpoints autenticados mínimos: validar/guardar segmento, preview, confirmar selección y selección manual. No se añadieron frontend, IA, workers, propuestas ni mensajería.
- Validación vigente: L1+L2 35/35, backend 413/413, build backend correcto y lint backend sin errores. `OutboundMessage` permanece en cero en las pruebas L2.

## Lanzamientos L1 consolidado: dominio y contratos — 2026-08-22
- `Launch`, `LaunchParticipant` y `LaunchEvent` constituyen un agregado owner-scoped sin rutas públicas, workers, propuestas ni mensajería. El lifecycle de lanzamiento es `draft → scheduled → prelaunch → live → followup → completed`, con cancelación terminal desde cualquier etapa no terminal.
- La participación conserva dimensiones independientes para etapa, invitación, registro, confirmación, asistencia y resultado. Registro, confirmación, asistencia/no-show y resultados terminales exigen evidencia tipada; asistencia permanece `unknown` sin evidencia fiable.
- Un índice por lanzamiento y `participantKey` evita duplicados por lead o contacto multicanal ya confirmado, sin crear ni inferir vínculos de identidad. El mismo lead puede participar en distintos lanzamientos.
- `LaunchLifecycleService` valida owner, fechas, timezone, referencias existentes, opt-out, transiciones, evidencia e idempotencia. `LaunchEvent` mantiene auditoría mínima sin copiar payloads completos; las actualizaciones usan versión y filtros condicionales para carreras concurrentes.
- Validación vigente: L1 22/22, backend 400/400, build backend correcto y lint backend sin errores. Frontend no fue modificado. L1 no importa ni crea `OutboundMessage` y no dispone de ninguna vía de envío.

## Automatización 5 consolidada: seguimiento multicanal seguro — 2026-08-22
- `ContactProfile` y `ContactIdentity` agrupan leads únicamente después de confirmación humana explícita; no se fusionan leads, conversaciones ni historiales. Las coincidencias exactas de correo o teléfono solo crean `DuplicateCandidate` revisables y nunca enlazan automáticamente nombres o usuarios parecidos.
- Seguimiento, reactivación y reuniones consultan contacto confirmado, preferencia y consentimiento antes de crear propuestas. Un opt-out general o por canal, una respuesta en otra identidad, una reunión activa o un destinatario obsoleto bloquean o invalidan la propuesta asistida.
- Las tareas pendientes se coordinan por contacto confirmado mediante una clave única durable. El CRM permite confirmar/rechazar candidatos, elegir canal preferido, registrar consentimiento u opt-out, bloquear todo seguimiento y deshacer vínculos con auditoría.
- WhatsApp, Instagram y Facebook conservan propuestas editables y aprobación humana; YouTube solo genera tarea cuando no existe un destinatario saliente seguro. No se habilitó ningún autoenvío ni se cambiaron modos de proveedores.
- Validación vigente: backend 378/378, frontend 7/7, compilaciones backend/frontend correctas y lint backend sin errores (advertencias históricas de tipado permanecen).

## Automatización 4 consolidada: reuniones asistidas — 2026-08-22
- El worker durable existente materializa recordatorios configurables y acciones posreunión con claves únicas, reclamación recuperable, aislamiento por propietario y compatibilidad Zoom/Calendly; no existe scheduler paralelo ni autoenvío.
- `MeetingAction` conserva ventanas, snapshots, intentos, tareas y propuestas. Reprogramación, cancelación, cambio de estado/canal/conversación y TTL invalidan recordatorios y opciones antiguas sin depender de abrir CRM.
- El lifecycle unifica resultados `attended`, `no_show`, `cancelled`, `technical_failure` y `pending_review`. Una reunión pasada queda en revisión humana; nunca se infiere no-show por el paso del tiempo.
- CRM permite confirmar asistencia, registrar no-show o fallo técnico y revisar propuestas de agenda, recordatorio y seguimiento. Gemini/mock usa fecha, zona, historial y resultado confirmado sin inventar conclusiones.
- Eventos añadidos: `meeting.reminder_due`, `meeting.no_show` y `meeting.followup_due`. Seguimiento y calificación no se modifican arbitrariamente y una reunión activa continúa suspendiendo seguimientos comerciales incompatibles.
- Validación vigente: reuniones 16/16, regresión enfocada 95/95, backend 366/366, frontend 7/7, builds correctos y lint backend sin errores.

## Automatización 2 consolidada: reactivación asistida — 2026-08-22
- El worker durable existente detecta conversaciones inactivas con una política configurable, reclamación atómica, aislamiento por propietario, cooldown y máximo de intentos; no existe un scheduler paralelo.
- Reutiliza seguridad de seguimiento, calificación e historial durable para excluir opt-out/rechazo, cierres, control humano, reuniones activas, actividad reciente y propuestas vigentes.
- Gemini/mock genera una continuación contextual con memoria y evita repetir preguntas/respuestas. WhatsApp, Instagram y Facebook crean propuesta editable; YouTube queda como tarea cuando no existe un destinatario de hilo seguro.
- Las propuestas guardan snapshot y vencimiento, se invalidan por respuesta, estado, reunión, canal, conversación, reemplazo o TTL y se revalidan antes de editar/enviar.
- La reactivación nunca llama a mensajería: solo crea tarea/propuesta CRM y cualquier envío requiere aprobación humana autenticada.
- Validación vigente: 18/18 pruebas enfocadas, regresión backend 349/349 previa a la prueba adicional, frontend 7/7, builds correctos y lint backend sin errores.

## Quinta automatización comercial combinada — 2026-08-21
- `Interés combinado → Calificación asistida` se materializa únicamente bajo demanda como borrador inactivo y responde a `message.received` con `normalizedIntent=business_and_product_interest` en WhatsApp, Instagram o Facebook.
- La intención actual puede evolucionar explícitamente hacia productos, venta o negocio sin borrar señales y tags históricos. Si el prospecto mantiene ambos intereses, ALMA consulta el historial y evita repetir la pregunta de priorización.
- La automatización solo añade `interes_negocio_y_productos`, genera/reutiliza una propuesta asistida y consolida el seguimiento mediante `TaskService`; no modifica score, estado o meeting intent, no crea reuniones y no envía mensajes.
- Conserva el mínimo conversacional existente de 70 para interés combinado y separa el interés comercial de una intención explícita de reunión. La plantilla es genérica y obtiene marca, información autorizada y restricciones desde `CommercialContext`.
- Validación vigente: regresión comercial 121/121, backend 305/305, frontend 7/7, builds y type-check correctos; lint backend sin errores.

## Fase 8 consolidada: auditoría final del MVP — 2026-08-21
- Se eliminaron métricas ficticias del Dashboard; sus totales, tendencia semanal y canales provienen de una agregación Mongo real. Social Scraper y Lead Hunter mock quedan rotulados como demostración.
- Se cerró un P0 de asignación masiva que permitía cambiar el owner de un lead. La idempotencia de inbound, outbound y propuestas ahora se aísla por owner, evitando colisiones entre tenants.
- Los reintentos ambiguos de creación Zoom quedan bloqueados para verificación manual; los errores 5xx no exponen detalles en producción. Se reforzaron validación, rate limiting e índices owner-first.
- Se eliminaron únicamente `Topbar.tsx` y `StatCard.tsx`, demostrablemente sin consumidores.
- Validación vigente: 169/169 pruebas backend y 7/7 frontend; builds backend/frontend correctos; lint backend sin errores. Veredicto documentado: MVP funcional con limitaciones externas.

## Fase 7 consolidada: reuniones con confirmación explícita — 2026-08-21
- Un score alto ya no crea reuniones: el flujo Zoom requiere intención conversacional explícita, propuesta de disponibilidad, selección y confirmación antes de invocar al proveedor.
- `MeetingAvailabilityService` calcula opciones por días, ventana horaria, duración, zona IANA y buffers configurables. `MeetingLifecycleService` persiste solicitud, selección, confirmación, fallos, reintentos, cancelación, reprogramación, finalización e historial aislado por propietario.
- Zoom oficial soporta crear, actualizar y cancelar; el modo mock deja la selección en `pending_configuration`. La reserva atómica y su clave única impiden dobles confirmaciones y colisiones de horario. `startUrl` permanece excluido de consultas CRM normales.
- El CRM muestra estado, horario, zona, duración, canal, Zoom, errores e historial, con controles autenticados para reintentar, reprogramar, cancelar y completar. Automatizaciones recibe `meeting.intent_detected`, `meeting.requested`, `meeting.confirmed`, `meeting.failed` y `meeting.completed` sin acoplarse a Zoom.
- Validación vigente: 164/164 pruebas backend, compilaciones backend/frontend, type-check frontend y lint backend sin errores. No se realizó ninguna reunión real ni se cambiaron modos de proveedores.

## Fase 6 consolidada: motor de automatizaciones multicanal — 2026-08-21
- `AutomationFlow` conserva compatibilidad con reglas keyword históricas y añade estados, versión, triggers normalizados, condiciones AND/OR y acciones permitidas sin código arbitrario.
- `AutomationExecution` registra historial e idempotencia por automatización/evento; `AutomationJob` implementa esperas persistentes, recuperación tras reinicios y reintentos limitados.
- Las acciones de mensajería crean `AssistedProposal` y nunca invocan el proveedor outbound. Meta y WhatsApp emiten eventos al motor; YouTube conserva su keyword histórico y emite `message.received`; TikTok queda preparado pero desactivado.
- Automatizaciones permite crear, editar, activar, pausar/reactivar, duplicar, eliminar, consultar historial y filtrar. La plantilla `INFO → Calificación` se crea en borrador.
- Validación vigente: 149/149 pruebas backend, compilaciones backend/frontend y type-check frontend correctos; lint backend sin errores.

## Fase 4 consolidada: Meta multicanal asistido — 2026-08-20
- El webhook Meta valida firma, normaliza comentarios y mensajes de Instagram/Facebook, persiste el evento idempotente y responde antes de ejecutar IA; el procesamiento posterior conserva fallos y admite recuperación segura.
- La intención inicial reconoce frases configurables además de `INFO`. Los identificadores se aíslan por plataforma y los leads conservan origen inicial, canal actual y evidencia pública permitida sin asociaciones especulativas entre identidades.
- `AssistedProposal` generaliza las propuestas históricas de WhatsApp sin cambiar su colección. Instagram, Facebook y WhatsApp permiten editar, aprobar una sola vez y enviar manualmente desde CRM; Meta permanece en `mock` y sin autoenvío.
- `MessagingRecipient`, `MessagingService`, `MetaMessagingProvider` y `OutboundMessage` distinguen comentarios/usuarios de Instagram y Facebook, incluyendo Page PSID y respuestas privadas a comentarios.
- Validación vigente: 122/122 pruebas backend, compilaciones backend/frontend correctas y lint backend sin errores.

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
