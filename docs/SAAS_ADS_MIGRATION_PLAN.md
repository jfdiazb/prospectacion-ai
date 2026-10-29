# Plan gradual ALMA SaaS y ALMA ADS

## Principios

- La base actual no se convierte ni se migra automáticamente.
- `userId` continúa siendo el límite vigente hasta que cada agregado tenga `organizationId` validado.
- Ninguna lectura acepta un tenant desde body/query sin derivarlo de una membresía autenticada.
- Las credenciales sociales se cifran por conexión y tenant; nunca se incluyen en logs.
- Facturación, límites y ADS no habilitan envíos, publicaciones o gasto sin autorización explícita.

## Modelo objetivo

1. `Organization`: nombre, estado, zona, plan y retención.
2. `OrganizationMembership`: usuario, organización, rol (`owner`, `admin`, `operator`, `viewer`) y estado.
3. `ChannelConnection`: organización, proveedor, cuenta, scopes, tokens cifrados, vigencia y reconexión.
4. `Subscription` y `UsageLedger`: plan, periodo, límites, unidades de IA/API y costo estimado inmutable.
5. `AuditEvent`: actor, organización, acción, recurso, resultado y correlación; sin payloads sensibles.
6. Entidades operativas: `organizationId` junto con claves e índices owner-first durante la transición.

## Migración sin afectar producción

### Etapa 0 — inventario

- Catalogar colecciones, consultas sin `userId`, índices únicos y workers.
- Medir volumen, cardinalidad y documentos huérfanos.
- Añadir pruebas negativas cross-tenant antes de introducir organizaciones.

### Etapa 1 — esquema aditivo

- Crear organizaciones/membresías sin cambiar rutas actuales.
- Crear una organización personal para usuarios nuevos.
- Añadir `organizationId` opcional e índices parciales, sin backfill destructivo.

### Etapa 2 — doble validación

- Middleware deriva organización desde JWT/membresía.
- Nuevas escrituras guardan `userId + organizationId`.
- Lecturas comparan ambos límites y alertan divergencias; nunca hacen fallback entre tenants.

### Etapa 3 — backfill controlado

- Trabajo reanudable, idempotente y paginado asigna documentos al tenant confirmado.
- Dry-run con conteos/conflictos; respaldo y rollback por lote.
- Índices únicos migran a `organizationId + clave` solo tras resolver conflictos.

### Etapa 4 — enforcement

- `organizationId` pasa a obligatorio agregado por agregado.
- Workers reclaman por organización y aplican cuotas/fairness.
- Se retira el fallback por `userId` tras una ventana sin divergencias.

## Seguridad y operación

- RBAC central y autorización de recurso también en servicios.
- Claves de cifrado versionadas/rotables; secretos separados de la base.
- Rate limits por IP, usuario, organización, proveedor y operación costosa.
- Cola durable con idempotencia por tenant, backoff con jitter, dead-letter y circuit breaker.
- Presupuestos de IA por organización y ledger de tokens/costos antes de facturar.
- Backups cifrados, restauración ensayada y RPO/RTO definidos antes de comercializar.

## Contrato futuro ALMA ADS → CRM

Flujo: anuncio → click/formulario → prospecto → conversación → calificación → reunión → conversión.

Identificadores mínimos: `organizationId`, `adAccountId`, `campaignId`, `adSetId`, `adId`, `creativeId`, `sourceEventId`, identificador de click permitido, `capturedAt`, ventana de atribución, `leadId`, `conversationId` y `meetingId`.

La ingesta ADS debe ser un inbox firmado, versionado, idempotente y organization-scoped. No usar nombres, texto o IA como clave de atribución. CPL y costo por reunión se calculan solo con gasto confirmado y hechos CRM persistidos.

Publicar campañas o modificar presupuesto requiere una orden separada con actor humano, límite monetario, doble confirmación, idempotency key y auditoría. Las capacidades DEMO no constituyen transporte LIVE.

## Puertas de salida

- Cero accesos cross-tenant en regresión.
- Restauración de backup ensayada.
- Cuotas/costos reconciliados y workers recuperables.
- Cada canal certificado por recepción real, aceptación y confirmación externa; `sent` no basta.
