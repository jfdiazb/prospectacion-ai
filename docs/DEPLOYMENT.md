# Documentación de Despliegue

## Despliegue en Producción

### Frontend (Vercel)

1. **Conectar repositorio a Vercel**
```bash
# Push a GitHub
git push origin main
```

2. **Configurar variables de entorno en Vercel**
```
VITE_API_URL=https://api.prospectacion-ai.com/api/v1
```

3. **Build automático**
- Vercel detectará automáticamente el `package.json`
- Build command: `npm run build`
- Output directory: `dist`

### Backend (Render.com)

1. **Crear nuevo servicio en Render**
- Tipo: Web Service
- Runtime: Node
- Build command: `npm install`
- Start command: `npm run start`

2. **Configurar variables de entorno**
```
NODE_ENV=production
MONGO_URI=mongodb+srv://...
JWT_SECRET=your-strong-secret
OPENAI_API_KEY=sk-...
FRONTEND_URL=https://prospectacion-ai.vercel.app
```

3. **Base de datos (MongoDB Atlas)**
- Crear cluster
- Obtener connection string
- Configurar IP whitelist

## Estructura de Despliegue

```
┌─────────────────────────────────────────┐
│   Frontend (Vercel)                     │
│   https://prospectacion-ai.vercel.app   │
└────────────────┬────────────────────────┘
                 │
                 ├── API Calls
                 │
┌────────────────▼────────────────────────┐
│   Backend (Render)                      │
│   https://api-prospectacion.onrender.com│
└────────────────┬────────────────────────┘
                 │
                 ├── Database Queries
                 │
┌────────────────▼────────────────────────┐
│   MongoDB Atlas                         │
│   Cloud Database                        │
└─────────────────────────────────────────┘
```

## CI/CD con GitHub Actions

Ver `.github/workflows/` para configuración automática.

## SSL/HTTPS

- Vercel: Automático
- Render: Automático
- MongoDB: Usa conexión encriptada

## Monitoreo

- Vercel: Analytics integrado
- Render: Logs en dashboard
- Sentry: Para error tracking (opcional)

## Escalabilidad

### Horizontal
- Frontend: CDN de Vercel
- Backend: Render auto-scaling

### Vertical
- MongoDB: Aumentar instancia
- Cache: Redis en Render

## Backups

- MongoDB Atlas: Snapshots automáticos
- GitHub: Control de versiones

## Seguridad en Producción

✅ HTTPS obligatorio
✅ JWT con expiry
✅ Rate limiting
✅ CORS configurado
✅ Variables protegidas
✅ Validación de entrada
✅ OWASP compliance
