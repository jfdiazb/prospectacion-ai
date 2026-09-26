# ALMA V1 — contrato de configuración productiva

Estado observado mediante `/health` y `/api/v1/readiness` el 26 de septiembre de 2026.
Este documento registra únicamente modos no secretos. Render continúa siendo la fuente de los
secretos y de los overrides operativos; sus valores no deben copiarse al repositorio.

## Política

`render.yaml` conserva defaults seguros que no inician polling ni envíos automáticos al recrear
el servicio. Las capacidades live que pueden producir tráfico real requieren un override humano
explícito en Render y evidencia operativa en readiness. Un flag o una credencial por sí solos no
permiten declarar un canal live.

## Matriz ALMA V1

| Variable | Blueprint seguro | Runtime observado | Intención V1 | Acción |
| --- | --- | --- | --- | --- |
| `WHATSAPP_AUTO_REPLY_ENABLED` | `false` | automático activo | WhatsApp operativo | Conservar override; no promover a Blueprint sin decisión humana. |
| `WHATSAPP_MESSAGING_MODE` | `mock` | outbound live verificado | WhatsApp operativo | Conservar override; no habilitar envíos desde Git. |
| `META_AUTO_SEND_ENABLED` | `false` | Instagram automático activo | Instagram operativo | Conservar override; no afecta el switch aislado de Facebook. |
| `INSTAGRAM_MESSAGING_MODE` | `live` | outbound live verificado | Instagram operativo | Alineado. |
| `YOUTUBE_POLLING_ENABLED` | `false` | inbound live verificado | YouTube operativo | Conservar override; evita polling accidental al recrear el servicio. |
| `YOUTUBE_MESSAGING_MODE` | `mock` | outbound live verificado | YouTube operativo | Conservar override; no habilitar respuestas desde Git. |
| `FACEBOOK_AUTO_SEND_ENABLED` | `false` | `false` | PENDING/BLOCKED | Alineado; no cambiar hasta aprobación externa. |
| `TIKTOK_API_APPROVED` | `false` | capacidad pendiente | PENDING | Alineado; flags no constituyen transporte. |

## Comprobación antes de release o despliegue

1. Consultar `/health` y confirmar el proveedor IA esperado.
2. Consultar `/api/v1/readiness`; `live` requiere evidencia persistida real.
3. Confirmar que Facebook siga `pending` y TikTok siga `pending`.
4. Comparar los modos no secretos de Render con esta matriz.
5. Detener el despliegue si un override habilita tráfico no aprobado o si el owner operativo no coincide.

Los cambios de estos overrides son operaciones productivas y no forman parte de un commit o
despliegue automático.
