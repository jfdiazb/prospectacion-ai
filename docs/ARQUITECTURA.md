# Guía de Arquitectura - Prospectación AI

## Visión General

Prospectación AI es un sistema SaaS moderno y escalable diseñado para automatizar la prospectación en redes sociales. La arquitectura sigue principios de arquitectura limpia y se divide en capas bien definidas.

## Capas de la Aplicación

### 1. Presentation Layer (Frontend)
- **Tecnología**: React 18 + TypeScript + TailwindCSS
- **Responsabilidades**:
  - Interfaz de usuario
  - Manejo de estado local
  - Validación de formularios
  - Renderización de componentes

**Estructura**:
```
src/
├── pages/       # Páginas principales
├── components/  # Componentes reutilizables
├── hooks/       # Custom hooks
├── context/     # Context API
├── services/    # Servicios HTTP
└── types/       # TypeScript interfaces
```

### 2. API Layer (Backend)
- **Tecnología**: Node.js + Express + TypeScript
- **Responsabilidades**:
  - Rutas HTTP
  - Validación
  - Autenticación
  - Rate limiting

**Estructura**:
```
backend/src/
├── routes/      # Definición de rutas
├── controllers/ # Lógica de rutas
├── middlewares/ # Middlewares
├── services/    # Lógica de negocio
├── models/      # Esquemas MongoDB
└── config/      # Configuración
```

### 3. Business Logic Layer
- **Ubicación**: Services (Backend)
- **Responsabilidades**:
  - Lógica de negocio
  - Cálculo de scores
  - Análisis de datos
  - Integraciones con IA

### 4. Data Access Layer
- **Tecnología**: MongoDB + Mongoose
- **Responsabilidades**:
  - CRUD operations
  - Queries
  - Índices
  - Validación de esquema

## Flujos de Datos Principales

### Autenticación
```
Login Form → API POST /auth/login 
→ AuthService.login()
→ Generar JWT
→ Guardar en localStorage
→ Redirect a Dashboard
```

### Crear Lead
```
Create Form → API POST /leads
→ LeadService.createLead()
→ Calcular Score
→ Guardar en MongoDB
→ Retornar Lead
```

### Generar Mensaje IA
```
Lead Data → API POST /ai/generate-message
→ AIService.generatePersonalizedMessage()
→ OpenAI API Call
→ Retornar Mensaje
→ Mostrar en UI
```

## Patrones de Diseño

### 1. Service Pattern
Centralizar lógica de negocio en servicios reutilizables.

### 2. Repository Pattern
Abstraer acceso a datos mediante modelos de Mongoose.

### 3. Context API
Manejar estado global de autenticación.

### 4. Middleware Pattern
Procesar requests antes de llegar a controladores.

## Seguridad

### Autenticación
- JWT con expiry de 24 horas
- Refresh tokens (futuro)
- Logout claro

### Autorización
- Verificación de ownership
- Roles y permisos
- Rate limiting

### Validación
- Server-side validation
- Sanitización de entrada
- CORS configurado

## Rendimiento

### Frontend
- Code splitting automático con Vite
- Lazy loading de componentes
- Caché de HTTP requests

### Backend
- Índices en MongoDB
- Paginación de resultados
- Rate limiting

## Escalabilidad

### Horizontal
- Stateless backend (ready for load balancer)
- CDN para frontend
- Database replication

### Vertical
- Optimización de queries
- Caching (Redis)
- Compression

## Monitoreo y Logging

### Backend
```typescript
console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
```

### Error Handling
- Try-catch en servicios
- Error middleware centralizado
- Error responses estructuradas

## Testing (Futuro)

```
frontend/
├── __tests__/
│   ├── components/
│   ├── hooks/
│   ├── services/
│   └── pages/

backend/
├── __tests__/
│   ├── controllers/
│   ├── services/
│   └── middleware/
```

## DevOps

### Docker (Futuro)
```dockerfile
# Backend
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
CMD ["npm", "start"]
```

### CI/CD
- GitHub Actions para testing
- Automático deployment a Vercel/Render
- Pre-deployment checks

## Dependencias Clave

### Frontend
- **react-router-dom**: Routing
- **react-query**: State management + HTTP caching
- **framer-motion**: Animaciones
- **axios**: HTTP client
- **tailwindcss**: Styling

### Backend
- **express**: Web framework
- **mongoose**: MongoDB ODM
- **jsonwebtoken**: JWT
- **openai**: IA
- **bull**: Task queue (futuro)

## Próximas Mejoras

1. **WebSockets**: Real-time notifications
2. **GraphQL**: Alternativa a REST
3. **Message Queue**: Bull para automatizaciones
4. **Caching**: Redis
5. **API Documentation**: Swagger/OpenAPI
6. **Testing**: Jest + React Testing Library
7. **Observability**: Prometheus + Grafana
8. **Mobile App**: React Native

## Decisiones Arquitectónicas

### ¿Por qué TypeScript?
- Type safety
- Mejor IDE support
- Menos bugs en producción

### ¿Por qué MongoDB?
- Flexible schema
- Escalable
- JSONsimilar a JavaScript

### ¿Por qué Tailwind?
- Utility-first
- Rápido de desarrollar
- Muy personalizable

### ¿Por qué Express?
- Lightweight
- Flexible
- Gran comunidad
