# Fase 6 — motor de automatizaciones

## Inicio

El worker arranca con el backend y consulta trabajos persistentes cada 30 segundos. No envía mensajes externos.

```env
AUTOMATION_WORKER_ENABLED=true
AUTOMATION_WORKER_INTERVAL_MS=30000
```

## Flujo

`evento normalizado → trigger → condiciones AND/OR → acciones → wait persistente → reanudación → historial`.

Colecciones: `automationflows`, `automationexecutions` y `automationjobs`. La clave SHA-256 `owner + automationId + eventId` impide ejecutar dos veces el mismo evento.

## Uso

En **Automatizaciones**, selecciona **Crear nueva**, configura trigger, plataforma opcional, condición y acción, guarda el borrador y actívalo después de revisarlo. El botón **Plantilla INFO** crea una sola vez `INFO → Calificación` en estado `draft`.

Para probar INFO de forma segura:

1. Crea la plantilla.
2. Conserva proveedores externos en `mock` y autoenvío apagado.
3. Revisa y activa la plantilla.
4. Envía `INFO` desde un fixture/control de WhatsApp, Instagram o Facebook.
5. Abre CRM y verifica la propuesta `proposed`; no se crea `OutboundMessage` hasta aprobación manual.
6. Consulta **Historial** en Automatizaciones para revisar pasos y resultado.

## Límites

- TikTok solo puede emitir eventos cuando su integración oficial sea aprobada y habilitada.
- YouTube mantiene su flujo histórico de respuesta oficial; el motor nuevo recibe `message.received` sin duplicar el trigger keyword anterior.
- El editor visual actual configura una acción inicial; flujos de múltiples pasos se ofrecen mediante la plantilla o API validada.
- Los retries se limitan a tres intentos y solo abarcan acciones internas idempotentes/protegidas; el motor nunca reintenta envíos externos.
