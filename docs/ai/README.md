# Documentación AI - Prospectación AI

## Resumen del proyecto
`prospectacion-ai` es una plataforma SaaS para automatizar la captación y gestión de prospectos en redes sociales usando inteligencia artificial.

## Arquitectura
- `frontend/`: React 18 + TypeScript + TailwindCSS
- `backend/`: Node.js + Express + MongoDB
- `docs/ai/`: documentación técnica resumida del proyecto

### Capas principales
1. **Frontend**
   - Páginas: `src/pages`
   - Componentes: `src/components`
   - Estado/Contexto: `src/context`, `src/hooks`
   - Servicios API: `src/services`
   - Tipos: `src/types`

2. **Backend**
   - Rutas: `backend/src/routes`
   - Controladores: `backend/src/controllers`
   - Servicios de negocio: `backend/src/services`
   - Modelos de datos: `backend/src/models`
   - Middlewares: `backend/src/middlewares`

## Componentes clave
- `frontend/src/components/AppLayout.tsx`
- `frontend/src/components/Navbar.tsx`
- `frontend/src/components/Sidebar.tsx`
- `frontend/src/components/shared.tsx`
- `frontend/src/pages/DashboardPage.tsx`
- `frontend/src/context/AuthContext.tsx`
- `frontend/src/services/leadService.ts`

## Tecnologías principales
- React 18
- TypeScript
- TailwindCSS
- Framer Motion
- Lucide React
- Recharts
- Axios
- React Router DOM
- Node.js
- Express
- MongoDB
- JWT

## Flujo del sistema
1. El usuario inicia sesión con autenticación JWT.
2. El frontend consume la API backend para obtener datos de leads, estadísticas y usuarios.
3. El backend procesa requests, valida datos y accede a MongoDB.
4. El dashboard muestra estadísticas y gráficos interactivos.
5. Las acciones del usuario (crear lead, actualizar estado, ver prospectos) pasan por servicios y endpoints.

## Reglas de diseño
- Mantener UI responsive y accesible.
- Usar animaciones suaves con `framer-motion`.
- Aplicar hover effects consistentes en tarjetas y botones.
- Preferir componentes reutilizables.
- Mantener estilos en Tailwind con clases semánticas y escalables.
- Preservar modo oscuro elegante.
- Documentar cambios de arquitectura y estado en este archivo.

## Estado actual
- Frontend revisado y modernizado.
- Dashboard con componentes visuales y gráficos.
- Síntesis de documentación creada en `AGENTS.md` y este archivo.
- `lucide-react` instalado y usado en el frontend.
- `npm run type-check` pasa.

## Pendientes
- Añadir pruebas unitarias en frontend/backend.
- Crear documentación de API con Swagger o OpenAPI.
- Agregar status y notas sobre cambios en `docs/ai/README.md` tras cada tarea.
- Incluir un sistema de actualizaciones automáticas de documentación bajo cambios de proyecto.
- Documentar endpoints exactos de backend en `docs/ai/` si son expandidos.
