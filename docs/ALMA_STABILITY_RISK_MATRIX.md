# Matriz de estabilidad preventiva y evidencia de ALMA

Fecha: 2026-11-08. Entorno: producción. SHA observado: `a311d33d87e8f449ad34f21d72ef68ed40e5fa36`.

| Riesgo | Mecanismo existente comprobado | Faltante | Prioridad |
|---|---|---|---|
| Diagnóstico incorrecto de credenciales | Readiness y errores sanitizados | Separar `configured`, `verified` y `confirmed` en reportes | P0 |
| Release distinto al auditado | Comparación `RELEASE_COMMIT`/`RENDER_GIT_COMMIT` | Verificador externo que falle ante discrepancia | P0 |
| Aceptación confundida con entrega | Lifecycle `sent/confirmed/unknown` y readback exacto | Extender readback a cada transporte aplicable | P0 |
| Social Scraper activo sin datos reales | Cuota durable, timeout y proveedor live | Readback autenticado del SHA desplegado | P0 |
| Credencial permanente reintentada | Bloqueo por huella y reautorización | Alertas uniformes por canal | P1 |
| Fallo transitorio | Reclamaciones, `retryAfter`, leases y límites | Backoff con jitter y métricas consolidadas | P1 |
| Poller detenido | Diagnóstico YouTube de ausencia/stale | Salud uniforme para Meta, WhatsApp, Groq y automatizaciones | P1 |
| Duplicados | Fingerprints, claves únicas e idempotencia owner-scoped | Alerta común de conflictos agotados | P2 |
| MongoDB inaccesible | Ping de readiness | Distinguir red, allowlist, DNS y autenticación sin inferencias | P1 |

## Evidencia actual

- `CONFIRMADO`: producción ejecuta `a311d33d87e8f449ad34f21d72ef68ed40e5fa36`; Social Scraper reporta `live`, proveedor YouTube y credencial configurada.
- `CONFIRMADO`: la sonda real del SHA anterior consultó al proveedor durante el build; no certifica por sí sola el SHA actual.
- `NO_VERIFICADO`: readback autenticado del Social Scraper actual. Sin JWT QA, la configuración no sustituye la prueba.
- `NO_VERIFICADO`: acceso local a MongoDB; el auditor terminó con `MongooseServerSelectionError`, que no demuestra credencial ausente o inválida.
- `CONFIRMADO`: GO LIVE general sigue falso por falta de confirmación externa ligada al SHA actual; Instagram figura bloqueado por evidencia persistida.

## Mejora crítica

`npm run evidence:production` exige el SHA esperado. Con `ALMA_PRODUCTION_BEARER_TOKEN` ejecuta una consulta autenticada y solo confirma datos reales si el resultado es `live`, procede de `youtube-data-api-v3`, no es caché y su muestra es coherente. El token nunca aparece en el reporte.
