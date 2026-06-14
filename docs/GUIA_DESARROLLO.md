# Guía de Desarrollo

## Estructura de Carpetas

```
prospectacion-ai/
├── backend/                 # API Node.js + Express
│   ├── src/
│   │   ├── index.ts        # Entry point
│   │   ├── config/         # Configuración (DB, constants)
│   │   ├── controllers/    # Handlers de rutas
│   │   ├── models/         # Esquemas MongoDB
│   │   ├── routes/         # Definición de rutas
│   │   ├── services/       # Lógica de negocio
│   │   ├── middlewares/    # Middlewares (auth, errors)
│   │   ├── types/          # Interfaces TypeScript
│   │   └── utils/          # Utilidades (helpers)
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
│
├── frontend/                # App React + TypeScript
│   ├── src/
│   │   ├── main.tsx        # Entry point
│   │   ├── App.tsx         # Rutas principales
│   │   ├── pages/          # Páginas (Login, Dashboard, etc)
│   │   ├── components/     # Componentes reutilizables
│   │   ├── hooks/          # Custom hooks
│   │   ├── services/       # Servicios API
│   │   ├── context/        # Context API
│   │   ├── types/          # Interfaces TypeScript
│   │   ├── utils/          # Utilidades
│   │   ├── assets/         # Imágenes, iconos
│   │   └── index.css       # Estilos globales
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── package.json
│   └── tsconfig.json
│
├── docs/                    # Documentación
│   ├── API.md              # Referencia de API
│   ├── ARQUITECTURA.md     # Decisiones de diseño
│   ├── SETUP.md            # Instalación local
│   └── DEPLOYMENT.md       # Despliegue en producción
│
├── .github/                 # GitHub workflows
│   └── workflows/
│       ├── ci.yml          # Testing automático
│       └── deploy.yml      # Deploy automático
│
├── .gitignore
├── README.md
├── docker-compose.yml
└── package.json (root, futuro)
```

## Flujo de Desarrollo

### 1. Crear una Feature Nueva

```bash
# 1. Crear rama desde main
git checkout -b feature/nueva-feature

# 2. Instalar dependencias si es necesario
# Backend
cd backend && npm install

# Frontend
cd frontend && npm install

# 3. Hacer cambios

# 4. Testear localmente
npm run dev

# 5. Commit
git add .
git commit -m "feat: descripción de la feature"

# 6. Push y Pull Request
git push origin feature/nueva-feature
```

### 2. Estructura de Commits

```
feat: nueva funcionalidad
fix: arreglar bug
docs: cambios en documentación
style: cambios de formato (sin lógica)
refactor: refactorizar código
perf: mejoras de rendimiento
test: agregar tests
chore: tareas de mantenimiento
```

## Backend Development

### Agregar Nueva Ruta

**1. Crear Controller** (`src/controllers/NewController.ts`):
```typescript
import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.js';
import { HTTP_STATUS } from '../config/constants.js';

export class NewController {
  static async action(req: AuthRequest, res: Response): Promise<void> {
    try {
      // Lógica
      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Success',
        data: {}
      });
    } catch (error: any) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: error.message
      });
    }
  }
}
```

**2. Crear Service** (`src/services/NewService.ts`):
```typescript
export class NewService {
  static async businessLogic(): Promise<any> {
    // Lógica de negocio
  }
}
```

**3. Crear Ruta** (`src/routes/newRoutes.ts`):
```typescript
import express from 'express';
import { NewController } from '../controllers/NewController.js';
import { authMiddleware } from '../middlewares/auth.js';

const router = express.Router();
router.get('/path', authMiddleware, NewController.action);
export default router;
```

**4. Registrar Ruta** (en `src/index.ts`):
```typescript
import newRoutes from './routes/newRoutes.js';
app.use('/api/v1/new', newRoutes);
```

### Usar IA en Backend

```typescript
import { AIService } from '../services/AIService.js';

// Generar mensaje
const message = await AIService.generatePersonalizedMessage({
  username: 'usuario',
  bio: 'su bio',
  platform: 'instagram',
  interestLevel: 'warm'
});

// Analizar sentimiento
const analysis = await AIService.analyzeSentiment('mensaje del usuario');
```

### Trabajar con MongoDB

```typescript
// Crear modelo
const lead = await Lead.create({
  userId: req.userId,
  username: 'usuario',
  platform: 'instagram'
});

// Buscar
const leads = await Lead.find({ userId: req.userId });
const lead = await Lead.findById(id);

// Actualizar
await Lead.updateOne({ _id: id }, { status: 'new' });

// Eliminar
await Lead.deleteOne({ _id: id });

// Contar
const count = await Lead.countDocuments({ userId });
```

## Frontend Development

### Crear Página Nueva

**1. Crear archivo** (`src/pages/NewPage.tsx`):
```typescript
import { motion } from 'framer-motion';
import { Navbar } from '@components/Navbar';
import { Sidebar } from '@components/Sidebar';

export const NewPage = () => {
  return (
    <div className="min-h-screen bg-dark-900">
      <Navbar />
      <Sidebar />
      
      <main className="ml-64 mt-16 p-8">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          {/* Contenido */}
        </motion.div>
      </main>
    </div>
  );
};
```

**2. Agregar ruta** (en `src/App.tsx`):
```typescript
<Route 
  path="/new" 
  element={<ProtectedRoute element={<NewPage />} />} 
/>
```

### Usar Servicios de API

```typescript
import { leadService } from '@services/leadService';
import { aiService } from '@services/aiService';

// Obtener leads
const { data: leads } = await leadService.getLeads(1, 20);

// Generar mensaje
const message = await aiService.generateMessage({
  username: '@user',
  bio: 'bio',
  platform: 'instagram',
  interestLevel: 'warm'
});
```

### Usar Context

```typescript
import { useAuth } from '@context/AuthContext';

const MyComponent = () => {
  const { user, isAuthenticated, login, logout } = useAuth();
  
  return (
    <div>
      {isAuthenticated && <p>Hola {user?.fullName}</p>}
    </div>
  );
};
```

### Animaciones con Framer Motion

```typescript
import { motion } from 'framer-motion';

// Animación simple
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.3 }}
>
  Contenido
</motion.div>

// Interacción
<motion.button
  whileHover={{ scale: 1.05 }}
  whileTap={{ scale: 0.95 }}
>
  Click me
</motion.button>

// Variantes reutilizables
const variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 }
};

<motion.div variants={variants} initial="hidden" animate="visible" />
```

## Testing

### Backend (Futuro)

```bash
# Instalar Jest
npm install --save-dev jest ts-jest @types/jest

# Crear test
# __tests__/services/AuthService.test.ts

import { AuthService } from '../../src/services/AuthService';

describe('AuthService', () => {
  test('should register user', async () => {
    // Test logic
  });
});

# Ejecutar tests
npm test
```

### Frontend (Futuro)

```bash
# Instalar React Testing Library
npm install --save-dev @testing-library/react @testing-library/jest-dom

# Test componente
import { render, screen } from '@testing-library/react';
import { Button } from '../Button';

test('renders button', () => {
  render(<Button>Click me</Button>);
  expect(screen.getByText('Click me')).toBeInTheDocument();
});
```

## Debugging

### Backend

```typescript
// Console logs
console.log('Debug:', variable);
console.error('Error:', error);

// Debugger en VS Code
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Launch Program",
      "program": "${workspaceFolder}/backend/src/index.ts",
      "outFiles": ["${workspaceFolder}/backend/dist/**/*.js"]
    }
  ]
}
```

### Frontend

```typescript
// React Developer Tools (extensión de Chrome)
// Debugger en console
debugger;

// Logs con contexto
console.group('Lead Created');
console.log('Lead:', lead);
console.log('Score:', lead.score);
console.groupEnd();
```

## Performance Tips

### Backend
- Usar índices en MongoDB
- Paginación en queries grandes
- Caching con Redis (futuro)
- Lazy loading de relaciones

### Frontend
- Code splitting con React.lazy
- Lazy loading de componentes
- Memoization con useMemo
- Virtual scrolling para listas grandes

## Seguridad

### Backend
✅ Validar entrada del usuario
✅ Sanitizar strings
✅ JWT con expiry
✅ Rate limiting
✅ CORS configurado
✅ Secrets en .env

### Frontend
✅ No guardar secrets en código
✅ HTTPS en producción
✅ Validación de inputs
✅ XSS protection
✅ CSRF tokens

## Mejores Prácticas

### Código Limpio
- Nombres descriptivos
- Funciones pequeñas
- Comentarios en lógica compleja
- DRY (Don't Repeat Yourself)

### Commits
- Commits pequeños y atómicos
- Mensaje claro y conciso
- Referencia a issues

### Reviews
- Revisar código antes de merge
- Feedback constructivo
- Testing antes de merge

## Recursos Útiles

- [Express.js Docs](https://expressjs.com)
- [React Docs](https://react.dev)
- [TypeScript Handbook](https://www.typescriptlang.org/docs)
- [Tailwind CSS Docs](https://tailwindcss.com/docs)
- [Framer Motion Docs](https://www.framer.com/motion)
- [MongoDB Docs](https://docs.mongodb.com)

## Ayuda y Soporte

- Issues: GitHub Issues
- Documentación: `/docs` folder
- Chat: Discord/Slack (futuro)
