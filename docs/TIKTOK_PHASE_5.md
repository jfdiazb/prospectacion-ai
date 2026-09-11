# Fase 5 — capacidad oficial TikTok

Estado verificado: 20 de agosto de 2026. La integración productiva permanece pendiente de aprobación oficial.

## Matriz de capacidades

| Capacidad | Estado en ALMA | Fundamento oficial |
|---|---|---|
| Representar leads y conversaciones TikTok en CRM | SUPPORTED | Capacidad interna; no requiere datos privados ni acceso a TikTok. |
| Leer comentarios de videos orgánicos propios | REQUIRES_APPROVAL | Accounts API permite listar comentarios de videos propios mediante el permiso TikTok Accounts. |
| Recibir actualización de comentarios por webhook | REQUIRES_APPROVAL | Organic/Accounts API documenta el evento de actualización de comentarios y configuración de webhooks. |
| Responder comentarios de videos propios | REQUIRES_APPROVAL | Accounts API expone la gestión y respuesta de comentarios propios. |
| Recibir y enviar mensajes directos de Business Account | REQUIRES_APPROVAL | Business Messaging API ofrece lectura, envío, conversaciones y webhooks; requiere acceso, revisión de privacidad y autorización. |
| Convertir comentario en mensaje | LIMITED | Business Messaging documenta Comment-to-Message, sujeto a capacidades de la cuenta/conversación y permisos de envío/lectura. |
| Identidad pública del autor | LIMITED | Solo se conservarán identificadores y nombres explícitamente entregados por el producto aprobado; no se enriquecerán perfiles. |
| Comentarios de videos ajenos o acceso general a comentarios | NOT_AVAILABLE | El caso comercial documentado se limita a videos de una cuenta propia. Research API no es una API CRM/comercial. |
| Scraping, navegador automatizado o endpoints privados | NOT_AVAILABLE | Prohibido por diseño y fuera de la arquitectura. |

## Implementación segura

`TikTokProvider` es el límite desacoplado que valida y normaliza fixtures con forma de evento oficial aprobado. `TikTokIngestionService` aplica el flag, palabra completa `INFO`, idempotencia por ID oficial, aislamiento por propietario y crea/reutiliza `Lead` y `Conversation`. El orquestador está inyectado: no se conecta a `AlmaService` ni publica respuestas hasta disponer de aprobación, contrato exacto del webhook y credenciales reales.

No se creó un webhook público ni se inventaron endpoints. `GET /api/v1/tiktok/status` requiere JWT y siempre presenta `pending_approval` con los valores predeterminados.

## Configuración

- `TIKTOK_API_APPROVED=false`
- `TIKTOK_INGESTION_ENABLED=false`
- `TIKTOK_MESSAGING_ENABLED=false`

Los tres flags están desactivados tanto en el ejemplo local como en Render. Una activación futura debe exigir simultáneamente aprobación confirmada, autorización de la cuenta, almacenamiento externo de tokens, verificación oficial del webhook y prueba controlada.

## Fuentes oficiales

- TikTok API for Business — Overview: https://ads.tiktok.com/gateway/docs/index?doc_id=1735712062490625
- TikTok API for Business — API reference/permission mapping: https://ads.tiktok.com/gateway/docs/index?doc_id=1735713875563521
- TikTok API for Business — Accounts API access requirement: https://ads.tiktok.com/gateway/docs/index?doc_id=1737565048641538
- TikTok for Developers — Webhooks overview/events: https://developers.tiktok.com/doc/webhooks-overview and https://developers.tiktok.com/doc/webhooks-events/
- TikTok for Developers — Login Kit/scopes: https://developers.tiktok.com/doc/login-kit-overview/ and https://developers.tiktok.com/doc/scopes-overview/

## Habilitación oficial posterior

1. Confirmar Business Account y Business Center de ALMA.
2. Registrar la app adecuada en TikTok for Business y presentar la solicitud de acceso a Accounts API/TikTok Accounts.
3. Solicitar Business Messaging API y completar revisiones de privacidad/seguridad aplicables.
4. Autorizar la cuenta y comprobar scopes concedidos; no basta con que la app sea aprobada.
5. Implementar el adaptador de transporte con el esquema y firma vigentes, guardar tokens cifrados/externos y registrar el webhook HTTPS.
6. Probar con allowlist; solo entonces cambiar flags de forma gradual.
