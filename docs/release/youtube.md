# Certificación de release — YouTube

## Identidad de ejecución

- Canal: YouTube
- SHA: se obtiene con `git rev-parse HEAD` en cada ejecución; no se reutiliza evidencia de otro commit.
- Fecha/hora: se registra al ejecutar la certificación.
- Suite local: lint, typecheck, unit, `evals:smoke` y `evals:full`.
- Evidencia externa: `OutboundMessage` exacto con `releaseCommit` igual al SHA, `externalMessageId`, mismo comentario padre, autor igual al canal conectado y moderación `published`.

## Estados

- **LOCAL PASS:** todas las verificaciones locales de ese SHA aprobaron; no implica publicación real.
- **EXTERNAL VERIFIED:** YouTube devolvió y el poller volvió a observar el ID exacto, en el padre exacto, publicado por el canal conectado.
- **STABLE:** el SHA externamente verificado permaneció dentro de umbrales durante 24–72 horas reales.
- **GO LIVE:** solo si LOCAL PASS, EXTERNAL VERIFIED, STABLE y readiness del mismo SHA están satisfechos.
- **BLOCKED:** falta credencial, acceso, despliegue, readback o tiempo de observación. Una simulación nunca cambia este estado.

## Observación y rollback

- Ventana: 24–72 horas sobre infraestructura persistente, nunca una terminal local.
- Límites: timeout de proveedor configurado, máximo de tres reintentos no ambiguos, revisión manual de timeouts ambiguos y cuota de polling existente.
- Alertas: cualquier 401/403, tasa 429 sostenida, 5xx repetidos, `unknown`, fallo de polling por hilo o aumento de `processing_failed`.
- Diagnóstico: buscar el `correlationId` desde `InboundEvent` hasta `OutboundMessage`; no registrar texto, token ni credenciales en telemetría.
- Rollback: detener auto-respuesta/polling si aplica, volver al último SHA con EXTERNAL VERIFIED del mismo canal y verificar `/health`; no usar evidencia del SHA anterior para certificar el nuevo.
- Umbral de rollback: error de autorización, duplicado confirmado, falsa afirmación comercial, pérdida de idempotencia o más de 2% de fallos no ambiguos en una muestra mínima de 50 eventos.

## Estado actual

- Ejecución local: 2026-11-06 (America/Bogota), SHA base `9b97ad2d39fdac378623d576bd8cc50269122172`, árbol con cambios locales sin commit.
- Casos: lint (0 errores, 633 advertencias heredadas), typecheck/build correcto, unit 67 suites / 899 pruebas, Promptfoo smoke 6/6 y full 26/26.
- LOCAL PASS: aprobado para el árbol local descrito; debe repetirse después de crear un SHA para certificar una release inmutable.
- EXTERNAL VERIFIED: BLOCKED; requiere despliegue y acceso autenticado a YouTube.
- STABLE: BLOCKED; no ha transcurrido una ventana de 24–72 horas.
- GO LIVE: no certificado.
