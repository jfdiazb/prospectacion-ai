# Fase 8 — Auditoría y consolidación del MVP ALMA

Fecha: 2026-08-21. Alcance: repositorio local. No se desplegó, no se modificaron credenciales y no se invocaron proveedores reales.

## 1. Estado general y matriz funcional

| Módulo | Estado | Externo pendiente | Evidencia |
|---|---|---|---|
| Autenticación y perfil | FUNCTIONAL | No | registro, login, JWT, perfil y contraseña en `auth.test.ts` |
| Dashboard | FUNCTIONAL | No | agregación Mongo real y regresión de métricas en `mvp-phase8.test.ts` |
| Prospectos | FUNCTIONAL | No | CRUD aislado; bloqueo de transferencia de owner probado |
| Lead Hunter | FUNCTIONAL/MOCK según entorno | OAuth YouTube para live | búsqueda, cuota, guardar y convertir a CRM probados |
| YouTube Monitor | FUNCTIONAL | OAuth/cuota de Google | cobertura, retry y diagnóstico probados |
| CRM y conversaciones | FUNCTIONAL | proveedor live para entrega real | historial, tareas, handoff, propuestas y envío controlado probados |
| WhatsApp | FUNCTIONAL EN MODO ASISTIDO | credenciales y callback Meta | webhook firmado → lead → conversación → IA/scoring → propuesta → aprobación; mock por defecto |
| Instagram/Facebook | FUNCTIONAL EN MODO ASISTIDO | app/permisos/tokens Meta | normalización, firma, idempotencia, propuesta y CRM probados; outbound mock |
| Automatizaciones | FUNCTIONAL | No | trigger, AND/OR, acciones, wait durable, retry, historial e aislamiento probados |
| Reuniones | FUNCTIONAL EN MOCK/Calendly | Zoom/Calendly según entorno | intención → opciones → confirmación → provider → CRM; doble confirmación y fallo probados |
| TikTok | PARTIAL / EXTERNAL | aprobación y capacidades oficiales | estado y normalización oficial preparados; ingesta/mensajería desactivadas |
| Social Scraper | MOCK | proveedor/fuente real | ahora rotulado inequívocamente como demo |
| Configuración | FUNCTIONAL/PARTIAL | conexiones distintas de YouTube no tienen UI propia | cuenta, seguridad, YouTube y diagnóstico funcionan |
| Integraciones y Reuniones independientes | UNUSED como rutas separadas | — | se administran dentro de Configuración y CRM; no existen pantallas paralelas |

## 2. Hallazgos y correcciones

### P0 corregidos

- `LeadService.updateLead` aceptaba `userId` dentro del payload y podía transferir un lead fuera de su propietario. Los campos de identidad y timestamps son ahora inmutables; existe regresión multiusuario.
- Las claves de eventos, propuestas y mensajes salientes eran únicas globalmente. Ahora son únicas por `{userId, externalEventId/sourceEventId}` y todas las reclamaciones YouTube/WhatsApp/propuestas incluyen owner.

### P1 corregidos

- Dashboard eliminó series, canales, funnel y barras ficticias. Una sola agregación Mongo devuelve totales, siete días y canales reales; errores y carga son visibles.
- Los reintentos Zoom ambiguos (`timeout` o resultado desconocido de creación) quedan bloqueados hasta verificación manual para no duplicar reuniones.
- Los errores 5xx ya no exponen el mensaje interno en producción.
- Social Scraper y Lead Hunter mock quedan identificados como demostración. Los filtros fijos deshabilitados explican su estado.
- TikTok status incorporó el mismo rate limiter autenticado del API; Social Scraper valida hashtag, usuario y plataforma.

### P2 pendientes

- Sustituir `any` históricos: lint finaliza con 0 errores y 212 advertencias.
- Dividir el bundle frontend (aprox. 842 kB sin comprimir).
- Corregir advertencias de configuración futura de Vite/Vitest y `isolatedModules` de ts-jest.
- Añadir calendario externo de ocupación al cálculo interno de disponibilidad.
- Crear una vista unificada de integraciones si el producto requiere administrar Meta/TikTok desde UI.
- Mejorar la granularidad de validación Joi/Zod en controladores heredados.

### P3

- Sustituir estados heredados de Calendly/Zoom mediante migración planificada.
- Mejorar code splitting, accesibilidad automatizada y pruebas visuales/browser completas.
- Convertir Social Scraper demo en integración oficial o retirarlo del producto comercial.

No quedan P0/P1 internos conocidos. Los bloqueos restantes son externos o deuda P2/P3.

## 3. Botones y pantallas

Dashboard navega a Hunter, Monitor, CRM y Prospectos. Prospectos permite crear, ver y generar mensaje. Hunter busca, guarda, convierte y abre evidencia. Automatizaciones crea, edita, filtra, activa, pausa, reactiva, duplica, elimina e inspecciona historial. CRM edita/envía propuestas, controla conversaciones, responde manualmente, cambia tareas y administra reuniones. Configuración conecta/desconecta YouTube, refresca diagnóstico, abre seguridad y cierra sesión. Monitor actualiza y reintenta solo fallos seguros.

Los controles fijos de Hunter permanecen deshabilitados con explicación. Social Scraper es una demo visible, no una integración real encubierta. No se encontraron botones visibles puramente decorativos después de la corrección.

## 4. Endpoints y código muerto

Las rutas de negocio están autenticadas y limitadas; las excepciones son health, OAuth callback y webhooks oficiales, que usan sus validaciones específicas. Los endpoints CRM, leads, Hunter, automatizaciones, monitor y reuniones filtran por owner. Los webhooks Meta, WhatsApp y Calendly validan firma/secreto antes de procesar.

Se eliminaron `Topbar.tsx` y `StatCard.tsx`, componentes sin imports ni consumidores. No se eliminó ningún servicio/provider por sospecha.

## 5. Índices y rendimiento

- Idempotencia: índices únicos `{userId, externalEventId}`, `{userId, sourceEventId}`, `idempotencyKey`, `reservationKey`, `bookingToken`.
- Leads: owner+platform+username, owner+status+fecha, owner+interestLevel+score.
- Conversaciones: owner+lead y owner+status+último mensaje.
- Automatizaciones: owner+status+trigger, ejecución e jobs por vencimiento.
- Reuniones: owner+conversation+status, owner+fecha+estado y reserva única.
- Hunter/YouTube: caché TTL, oportunidad, cuota y checkpoints por owner.

Dashboard pasó de cuatro conteos y datos fallback a una agregación `$facet`. Los pollers tienen exclusión mutua, mínimos de intervalo, rotación y límites de cuota. Los webhooks persisten/reclaman eventos antes del trabajo pesado.

## 6. Seguridad y observabilidad

- `.env` está ignorado; ejemplos no contienen valores reales. La búsqueda de patrones no encontró secretos reales versionables.
- JWT protege recursos; CORS exige allowlist en producción; Helmet y rate limiting están activos.
- Payload JSON/raw tiene límites. Meta, WhatsApp y Calendly verifican firmas/timestamps según integración.
- Tokens YouTube están cifrados; claves y credenciales son variables externas.
- `startUrl` usa `select:false`; CRM no lo devuelve.
- Logs críticos incluyen etapa, plataforma, estado/código seguro y contadores, sin tokens ni contenido sensible completo.
- Error middleware oculta detalles internos para 5xx en producción.

## 7. Resultados E2E controlados

- YouTube Hunter → oportunidad → conversión → lead CRM: PASS, incluido aislamiento owner.
- WhatsApp firmado → lead/conversation → análisis → propuesta → aprobación/envío mock y handoff: PASS.
- Instagram/Facebook firmado → normalización → lead/conversation → análisis → propuesta CRM: PASS.
- Automatización trigger → condición → acción → wait persistente → continuación → historial: PASS.
- Reunión intención → disponibilidad → propuesta → selección → confirmación → Zoom mock/provider inyectado → CRM: PASS.
- Multicanal: origen y canal actual, conversaciones, evidencia y recursos derivados permanecen aislados; las claves externas iguales pueden coexistir entre owners: PASS.
- TikTok: límites oficiales, desactivación, normalización e aislamiento: PASS; live no evaluado por falta de aprobación.

## 8. Pruebas y builds

- Backend: 21 suites, 169/169 pruebas PASS.
- Frontend: 3 archivos, 7/7 pruebas PASS.
- Backend TypeScript build: PASS.
- Frontend TypeScript + Vite production build: PASS.
- Backend lint: PASS, 0 errores y 212 advertencias.
- No se hicieron llamadas externas ni pruebas reales.

## 9. Integraciones y variables

Reales preparadas/operativas según configuración externa histórica: MongoDB, Gemini, YouTube OAuth/ingesta/mensajería, Calendly y Zoom S2S. En este ciclo no se verificó su estado remoto.

Pendientes externamente: app/permisos/tokens/callback Meta para Instagram, Facebook y WhatsApp; aprobación/capacidades TikTok; validación controlada de Zoom/Calendly/YouTube/Gemini en el entorno objetivo.

Variables por grupo, sin valores: `MONGO_URI`, `JWT_SECRET`, `CORS_ORIGIN`, `CRM_OWNER_ID`; `AI_MODE`, `GEMINI_API_KEY`; variables `YOUTUBE_*`; `META_APP_SECRET`, `META_VERIFY_TOKEN`, `META_ACCESS_TOKEN`, `META_IG_USER_ID`, `META_PAGE_ACCESS_TOKEN`, `META_PAGE_ID`; variables `WHATSAPP_*` y `VERIFY_TOKEN`; variables `ZOOM_*`; variables `CALENDLY_*`; variables `MEETING_*`; variables `AUTOMATION_WORKER_*`; variables `TIKTOK_*`.

## 10. Checklist de producción

- [ ] Entorno separado, secretos externos y rotación documentada.
- [ ] MongoDB con usuario mínimo, allowlist, índices sincronizados, backup y prueba de restauración.
- [ ] Dominio/HTTPS, CORS exacto, DNS y healthcheck.
- [ ] Meta/WhatsApp/Instagram/Facebook: app aprobada, callbacks HTTPS, firmas, tokens, allowlist piloto y autoenvío apagado inicialmente.
- [ ] TikTok: no activar hasta aprobación y capacidades oficiales verificadas.
- [ ] YouTube: OAuth/redirect, canal correcto, cuota y alertas del poller.
- [ ] Zoom/Calendly: scopes mínimos, zona horaria, prueba única controlada y reversión a mock.
- [ ] Gemini: clave restringida, presupuesto/cuota y fallback verificado.
- [ ] Logs centralizados, alertas de jobs/webhooks/provider, retención sin PII innecesaria.
- [ ] Rate limits revisados con tráfico esperado.
- [ ] Backups, monitorización, runbook de incidentes y rollback.
- [ ] Smoke tests autenticados y asistidos antes de habilitar tráfico.

## 11. Riesgos y veredicto

Riesgos restantes: dependencias de permisos/cuotas externos, falta de sincronización con calendarios ocupados, deuda de tipos, bundle grande y ausencia de una prueba real en este ciclo. El Blueprint contiene modos live históricos para YouTube/Gemini/Zoom y Calendly; cualquier despliegue debe revisar esos valores explícitamente. Meta/WhatsApp siguen asistidos/mock y TikTok desactivado.

**Veredicto: MVP FUNCIONAL CON LIMITACIONES.**

La evidencia automática cubre los flujos principales y no quedan P0/P1 internos conocidos. No corresponde declarar funcionalidad total porque Meta/TikTok y parte de la validación real dependen de permisos, credenciales y pruebas externas controladas.
