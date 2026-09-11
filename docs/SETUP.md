# Setup Local - Guía de Instalación

## Requisitos Previos

- **Node.js**: v18.0.0 o superior
- **MongoDB**: Local o MongoDB Atlas
- **Git**: Para clonar el repositorio
- **npm**: Incluido con Node.js
- **API Key OpenAI**: Para funcionalidad de IA

## Paso 1: Clonar el Repositorio

```bash
git clone https://github.com/yourusername/prospectacion-ai.git
cd prospectacion-ai
```

## Paso 2: Configurar Backend

### 2.1 Instalar dependencias

```bash
cd backend
npm install
```

### 2.2 Configurar variables de entorno

```bash
cp .env.example .env
```

Editar `.env`:

```env
NODE_ENV=development
PORT=5001
API_URL=http://localhost:5001

# Database
MONGO_URI=mongodb://localhost:27017/prospectacion-ai
# O usar MongoDB Atlas:
# MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/prospectacion-ai

# JWT
JWT_SECRET=tu-super-secret-key-cambiar-en-produccion
JWT_EXPIRES_IN=30d

# OpenAI
OPENAI_API_KEY=sk-your-api-key-here

# Frontend
FRONTEND_URL=http://localhost:3000

# Email (Nodemailer)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
```

### 2.3 Iniciar MongoDB (si usas local)

**Windows:**
```bash
mongod
```

**macOS (con Homebrew):**
```bash
brew services start mongodb-community
```

**Linux:**
```bash
sudo systemctl start mongod
```

### 2.4 Ejecutar backend en modo desarrollo

```bash
npm run dev
```

Deberías ver:
```
✅ Servidor corriendo en puerto 5001
✅ MongoDB conectado
```

## Paso 3: Configurar Frontend

### 3.1 Instalar dependencias

```bash
cd ../frontend
npm install
```

### 3.2 Configurar variables de entorno

```bash
cp .env.example .env
```

El archivo `.env` debería verse así:

```env
VITE_API_URL=http://localhost:5001/api/v1
VITE_APP_NAME=Prospectación AI
```

### 3.3 Ejecutar frontend en modo desarrollo

```bash
npm run dev
```

Accede a: `http://localhost:3000`

## Paso 4: Verificar la Instalación

1. **Frontend cargado**: Abre `http://localhost:3000`
2. **Backend respondiendo**: `http://localhost:5001/health`
3. **MongoDB conectado**: Verifica en la terminal del backend

## Paso 5: Crear Cuenta de Prueba

1. Haz clic en "Registrarse"
2. Completa el formulario:
   - Email: `test@example.com`
   - Contraseña: `TestPassword123`
   - Nombre: `Test User`
3. Haz clic en "Registrarse"
4. Serás redirigido al Dashboard

## Comandos Útiles

### Backend

```bash
# Desarrollo con hot reload
npm run dev

# Build para producción
npm run build

# Ejecutar build en producción
npm start

# Linter
npm run lint

# Formatear código
npm run format
```

### Frontend

```bash
# Desarrollo con hot reload
npm run dev

# Build para producción
npm run build

# Preview del build
npm run preview

# Linter
npm run lint

# Formatear código
npm run format

# Type checking
npm run type-check
```

## Solución de Problemas

### "Error: Cannot find module 'mongoose'"

```bash
cd backend
npm install
```

### "Error: connect ECONNREFUSED 127.0.0.1:27017"

Asegúrate que MongoDB está ejecutándose:

```bash
# Verificar que MongoDB está corriendo
mongosh

# O en otra terminal
mongod
```

### "Error: OPENAI_API_KEY is not set"

1. Obtén una API key de OpenAI (https://platform.openai.com/api-keys)
2. Agrégala a `.env`
3. Reinicia el backend

### "Port 5001 already in use"

Cambia el puerto en `.env`:

```env
PORT=5001
```

### "CORS Error"

Verifica que `FRONTEND_URL` en backend `.env` sea correcto:

```env
FRONTEND_URL=http://localhost:3000
```

## Base de Datos

### Usando MongoDB Local

1. Instalar MongoDB Community Edition
2. Iniciar servicio `mongod`
3. MONGO_URI en `.env`: `mongodb://localhost:27017/prospectacion-ai`

### Usando MongoDB Atlas (Recomendado)

1. Crear cuenta en https://mongodb.com/cloud/atlas
2. Crear un cluster free
3. Obtener connection string
4. Agregar a `.env`:

```env
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/prospectacion-ai?retryWrites=true&w=majority
```

## IDE Recomendado

- **VS Code** (Recomendado)
  - Extensión: Prettier
  - Extensión: ESLint
  - Extensión: Thunder Client (para testing de API)

## Git Setup

```bash
# Configurar usuario global
git config --global user.name "Your Name"
git config --global user.email "your@email.com"

# Clonar con HTTPS
git clone https://github.com/yourusername/prospectacion-ai.git

# O con SSH (si tienes keys configuradas)
git clone git@github.com:yourusername/prospectacion-ai.git
```

## Testing de API

### Usando Thunder Client (VS Code)

1. Instala la extensión Thunder Client
2. Crea una nueva request
3. POST: `http://localhost:5001/api/v1/auth/login`
4. Body:
```json
{
  "email": "test@example.com",
  "password": "TestPassword123"
}
```

### Usando cURL

```bash
curl -X POST http://localhost:5001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"TestPassword123"}'
```

## Próximos Pasos

1. ✅ Explorar el Dashboard
2. ✅ Crear algunos leads de prueba
3. ✅ Probar la IA para generar mensajes
4. ✅ Revisar la documentación en `/docs`

¡Listo! 🎉 Ahora puedes empezar a desarrollar.
