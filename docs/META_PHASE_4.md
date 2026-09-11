# Fase 4 — Facebook e Instagram oficiales en modo asistido

Estado: consolidada el 20 de agosto de 2026. Las llamadas reales permanecen desactivadas.

## Flujo

`Meta webhook → firma/validación → normalización → InboundEvent → respuesta HTTP 200 → Lead/Conversation → scoring/IA → AssistedProposal → revisión humana → MessagingService → MetaMessagingProvider → OutboundMessage`.

El webhook no espera a Gemini. Primero persiste los eventos relevantes y luego procesa las propuestas en segundo plano. Los fallos quedan en `InboundEvent.processingState=failed`, conservan el mensaje de la conversación y pueden reclamarse tras un minuto sin duplicar el mensaje.

## Eventos soportados

- Comentarios oficiales de Instagram y Facebook entregados por webhook.
- Mensajes oficiales de Instagram y Facebook Messenger entregados por webhook.
- Se ignoran ecos y eventos sin texto, autor o ID oficial.
- Los comentarios de personas nuevas requieren una intención inicial configurable; los DM soportados se consideran entradas conversacionales.

No se asocian identidades Facebook/Instagram entre sí salvo que una futura respuesta oficial entregue una relación inequívoca. No se usa scraping ni se consultan perfiles privados.

## Modo asistido

Meta no envía automáticamente. La IA crea una propuesta persistida con plataforma y destinatario oficial. El CRM permite editarla, aprobarla una sola vez y registrar el resultado. También permite mensajes humanos después de tomar control de la conversación.

La colección histórica `whatsappproposals` se conserva para no perder propuestas de la Fase 3; el modelo nuevo es multicanal y `WhatsAppProposal` permanece como exportación compatible.

## Variables

```env
META_MESSAGING_MODE=mock
INSTAGRAM_MESSAGING_MODE=mock
FACEBOOK_MESSAGING_MODE=mock
META_AUTO_SEND_ENABLED=false
META_INITIAL_INTENT_PHRASES=INFO,quiero información,más información,me interesa,información
```

Solo para una futura activación oficial controlada:

```env
META_APP_SECRET=
META_VERIFY_TOKEN=
META_ACCESS_TOKEN=
META_IG_USER_ID=
META_PAGE_ACCESS_TOKEN=
META_PAGE_ID=
```

## Endpoints

- `GET /api/v1/meta/webhook`: verificación oficial con `hub.mode`, `hub.verify_token` y `hub.challenge`.
- `POST /api/v1/meta/webhook`: recepción firmada con `X-Hub-Signature-256`.
- `GET /api/v1/crm/conversations`: conversaciones y propuesta más reciente del propietario autenticado.
- `PATCH /api/v1/crm/conversations/:conversationId/proposals/:proposalId`: edición.
- `POST /api/v1/crm/conversations/:conversationId/proposals/:proposalId/send`: aprobación y envío idempotente.
- `PATCH /api/v1/crm/conversations/:conversationId/control`: tomar/devolver control.
- `POST /api/v1/crm/conversations/:conversationId/messages`: respuesta humana multicanal.

## Verificación local

1. Mantener los modos de mensajería en `mock`, `META_AUTO_SEND_ENABLED=false` y `META_MOCK_MODE=true` solo fuera de producción.
2. Iniciar backend con `cd backend && npm run dev` y frontend con `cd frontend && npm run dev`.
3. Registrar un usuario local y configurar temporalmente su ObjectId como `CRM_OWNER_ID`.
4. Enviar fixtures con `x-alma-mock-event: true`; confirmar `InboundEvent`, `Lead`, `Conversation` y `AssistedProposal`.
5. Abrir CRM, editar y aprobar la propuesta. La entrega debe quedar `simulated`, nunca real.

## Prueba real futura controlada

Instagram y Facebook requieren una app Meta aprobada, activos correctamente vinculados, suscripciones webhook y permisos vigentes. Una prueba real debe hacerse por separado para cada canal, con un único comentario de una cuenta de prueba, autoenvío desactivado y aprobación humana desde CRM. Antes de enviar, confirmar que el destino normalizado sea `instagram_comment`/`instagram_user` o `facebook_comment`/`facebook_user`. No se modificaron credenciales ni se realizó esta prueba en la Fase 4.

## Limitación operativa

El trabajo posterior al HTTP 200 se ejecuta en el proceso del backend y queda respaldado por el estado durable de `InboundEvent`. Una evolución futura puede añadir un worker/cola durable independiente para reanudar automáticamente eventos después de una caída completa del proceso; actualmente una redelivery oficial o reclamación posterior recupera eventos fallidos/estancados.
