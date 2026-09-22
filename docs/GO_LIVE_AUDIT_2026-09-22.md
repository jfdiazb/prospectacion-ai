# Auditoría GO LIVE de ALMA — 2026-09-22

## Veredicto

ALMA conserva sus flujos internos y pruebas automatizadas operativas, pero no puede declararse completamente LIVE desde este entorno. No se ejecutaron envíos, cambios de credenciales, despliegues ni pruebas con prospectos reales. El hallazgo prioritario fue un falso positivo de TikTok: tres flags bastaban para mostrar `LIVE` aunque no existe transporte autenticado, webhook/poller ni proveedor outbound TikTok en el repositorio.

## TikTok

- `TikTokProvider` normaliza eventos inyectados; no llama una API.
- `TikTokIngestionService` procesa fixtures/eventos entregados por un orquestador externo; no recupera comentarios por sí mismo.
- No existe webhook TikTok público, poller, flujo OAuth/token, inspección de scopes ni proveedor de respuestas.
- El CRM y el adaptador de Lanzamientos aceptan eventos normalizados y mantienen idempotencia, aislamiento por propietario y opt-out.
- Se corrigió el diagnóstico: flags activos sin transporte ahora producen `PENDING`, nunca `LIVE`; el endpoint de estado separa capacidades solicitadas de capacidades efectivas y publica evidencia estructurada.

La API oficial sí documenta lectura y respuesta a comentarios de videos propios dentro de Organic/Accounts API, y mensajería directa dentro de Business Messaging API. Son productos y autorizaciones diferentes. ALMA necesita acceso aprobado al producto correspondiente, autorización de `@academiadigital10K`, token/scopes inspeccionables y configurar el webhook oficial o un poller de Accounts API antes de habilitar cada capacidad. Referencias: [TikTok API for Business](https://ads.tiktok.com/gateway/docs/index?doc_id=1738084416214017) y [TikTok Content Posting API](https://developers.tiktok.com/products/content-posting-api) (esta última no concede acceso a comentarios o DM).

## Estado verificable por canal

| Canal | Inbound | Outbound | Evidencia de esta auditoría | Estado |
| --- | --- | --- | --- | --- |
| WhatsApp | Implementado con webhook firmado | Proveedor real implementado, protegido por modo/allowlist | Pruebas automatizadas; sin credenciales ni tráfico real local | Requiere verificación externa |
| Instagram | Webhook Meta implementado | Proveedor Meta implementado y envío humano/asistido | Pruebas automatizadas; sin prueba API real | Requiere verificación externa |
| Facebook | Webhook Meta implementado | Proveedor implementado, Blueprint en mock | Faltan `META_PAGE_ID` y `META_PAGE_ACCESS_TOKEN` localmente | MOCK/PENDING |
| YouTube | OAuth/poller implementado | Respuestas e idempotencia implementadas | Pruebas automatizadas; Blueprint tiene polling apagado y outbound mock | DISABLED/MOCK |
| TikTok | Solo boundary inyectable | No existe proveedor | 12 pruebas enfocadas; sin API real | PENDING/DISABLED |

## Otras integraciones

- Groq: se preservaron proveedor, modelo `openai/gpt-oss-120b`, memoria, presupuesto y telemetría. Las pruebas de IA pasaron; no había `GROQ_API_KEY` local para una llamada real.
- MongoDB: las suites usan MongoDB efímero y validan aislamiento/idempotencia. No se modificó Atlas ni se inspeccionaron datos reales.
- CRM: pruebas de leads, conversaciones, actividades, propuestas, lanzamientos, opt-out y reuniones pasaron.
- Calendly: webhook y polling están implementados; el panel ya no muestra LIVE cuando `SCHEDULING_MODE=calendly` pero faltan token/URL. No se pudo verificar la conexión Calendly→Zoom.
- Zoom: proveedor y lifecycle están implementados, pero el Blueprint mantiene `ZOOM_MODE=mock`. El aviso de Calendly requiere revisar/reconectar Zoom dentro de Calendly; ALMA no debe inventar el enlace.
- Render: el Blueprint conserva TikTok apagado, YouTube polling apagado, Facebook/WhatsApp mock y Zoom mock. No se consultó ni modificó el entorno real de Render.

## Validación

- Backend: build correcto; 53 suites, 601 pruebas, todas aprobadas.
- TikTok/diagnóstico enfocado: 3 suites, 12 pruebas, todas aprobadas.
- Frontend: build correcto. Suite completa: 17/19 en el primer intento; las 3 pruebas de `ProfilePage` pasaron al repetirlas aisladamente, por lo que queda una inestabilidad de test/red jsdom a vigilar.
- Lint backend: 0 errores y 615 advertencias históricas.
- Advertencias no bloqueantes: bundle frontend de aproximadamente 898 kB y aviso de configuración futura de Vite.

## Verificación de producción posterior

- Render y Vercel desplegaron `b0a78c8` correctamente.
- MongoDB Atlas confirmó evidencia real minimizada: WhatsApp 198 inbound completados/196 outbound enviados; Instagram 22/19; YouTube 37/50. Facebook y TikTok no tienen evidencia real persistida.
- Groq registra 21 invocaciones completadas con `openai/gpt-oss-120b`, 18.369 tokens totales y latencia media aproximada de 676 ms; no aparecieron invocaciones fallidas en la agregación.
- Existe una reunión Calendly programada con identificador externo pero sin `joinUrl`, consistente con el fallo de conexión Calendly→Zoom informado por el propietario.
- Se reforzó `ReadinessService`: configuración/flags sin `InboundEvent` completado o `OutboundMessage` real enviado se reportan como `pending`, no como `live`. La verificación de Groq usa telemetría `AIInvocation` completada.

## Acciones externas necesarias

1. TikTok: confirmar en TikTok for Business que la app tiene Accounts API/Organic API, scopes de comentarios y autorización de la cuenta; solicitar Business Messaging por separado si se requieren DM. Solo después implementar/configurar credenciales y transporte y ejecutar una prueba controlada.
2. Render: revisar secretos y modos efectivos; no basta con activar flags. Desplegar este cambio requiere autorización del propietario.
3. Calendly: abrir Integrations en Calendly, desconectar/reconectar Zoom con el propietario correcto, confirmar permisos de creación de reuniones y ejecutar una reserva de prueba controlada.
4. Meta/WhatsApp/YouTube/Groq: ejecutar pruebas de humo autenticadas y de bajo impacto en producción antes de etiquetarlas LIVE.
