# AGENTS.md

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
