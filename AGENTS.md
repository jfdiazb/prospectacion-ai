# AGENTS.md

## Actualización técnica — 2026-08-03
- `backend/src/index.ts` es la única entrada canónica; los otros inicios son shims de compatibilidad sin lógica propia.
- Las pruebas de autenticación usan MongoDB efímero y ya no pueden ejecutar `dropDatabase()` sobre el `MONGO_URI` configurado.
- Se añadió el webhook `/api/v1/meta/webhook`, validación HMAC, idempotencia de eventos y captura de comentarios con la palabra `INFO`.
- El evento crea el lead de Instagram y abre/registra su conversación en MongoDB.
- Pendiente inmediato: respuesta privada oficial de Instagram, orquestador de calificación, seguimientos y Zoom.
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
