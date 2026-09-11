# 🚀 Quick Start - Prospectación AI

¡Comienza en 5 minutos!

---

## 📋 Requisitos

- **Node.js**: v18+ ([Descargar](https://nodejs.org))
- **MongoDB**: Local o [Atlas Cloud](https://www.mongodb.com/cloud/atlas)
- **OpenAI API Key**: [Obtener aquí](https://platform.openai.com/api-keys)
- **Git** (opcional)

---

## ⚡ Opción 1: Script Automático (Recomendado)

### Windows
```bash
cd d:\prospectacion-ai
setup.bat
```

### Linux / Mac
```bash
cd /ruta/a/prospectacion-ai
chmod +x setup.sh
./setup.sh
```

**¡Eso es todo!** El script automáticamente:
- ✅ Verifica requisitos
- ✅ Instala dependencias
- ✅ Configura variables de entorno
- ✅ Inicia los servidores

---

## 📝 Opción 2: Instalación Manual

### 1. Clonar / Navegar al proyecto
```bash
cd prospectacion-ai
```

### 2. Backend (Terminal 1)
```bash
cd backend

# Copiar variables de entorno
cp .env.example .env

# Instalar dependencias
npm install

# Iniciar servidor
npm run dev
```

**Debería ver**: `✓ Server running on http://localhost:5001`

### 3. Frontend (Terminal 2)
```bash
cd frontend

# Copiar variables de entorno
cp .env.example .env

# Instalar dependencias
npm install

# Iniciar servidor
npm run dev
```

**Debería ver**: `✓ Local: http://localhost:3000`

---

## 🔐 Configurar Variables de Entorno

### Backend (.env)

```env
NODE_ENV=development
PORT=5001

# MongoDB
MONGO_URI=mongodb://localhost:27017/prospectacion-ai

# JWT
JWT_SECRET=tu-secret-key-cambia-en-produccion
JWT_EXPIRY=24h

# OpenAI
OPENAI_API_KEY=sk-your-key-here
OPENAI_MODEL=gpt-3.5-turbo

# CORS
CORS_ORIGIN=http://localhost:3000
```

### Frontend (.env)

```env
VITE_API_URL=http://localhost:5001/api/v1
VITE_APP_NAME=Prospectación AI
```

---

## 🌐 Acceder a la Aplicación

### URLs
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5001/api/v1
- **MongoDB**: mongodb://localhost:27017 (local)

### Credenciales de Prueba
```
Email:    test@example.com
Password: TestPassword123
```

> 💡 Estas credenciales están disponibles después de ejecutar el script de setup o la primera vez que inicie la aplicación.

---

## 📊 Primeros Pasos en la App

### 1. Iniciar Sesión
1. Ve a http://localhost:3000
2. Usa credenciales de prueba
3. Haz clic en "Iniciar Sesión"

### 2. Dashboard
- Ver estadísticas generales
- Leads capturados
- Prospectos calientes
- Conversiones

### 3. Gestionar Leads
- Ve a "Leads" en el menú
- Crea un nuevo lead
- Edita información
- Usa IA para generar mensajes

### 4. Usar IA
- Genera mensajes personalizados
- Analiza sentimiento de mensajes
- Obtén respuestas a objeciones

---

## 🐛 Troubleshooting

### Puerto ya está en uso
```bash
# Encontrar proceso usando el puerto
# Windows
netstat -ano | findstr :5001

# Mac/Linux
lsof -i :5001

# Matar proceso (cambia PID)
kill -9 PID
```

### MongoDB no se conecta
```bash
# Verificar que MongoDB está corriendo
# Windows
mongosh

# Mac (con Homebrew)
brew services start mongodb-community

# Linux
sudo systemctl start mongod
```

### Error: OpenAI API Key inválida
1. Verifica tu API key en .env
2. Prueba la clave en https://platform.openai.com/account/api-keys
3. Asegúrate de tener créditos en OpenAI

### Dependencies issues
```bash
# Limpiar y reinstalar
rm -rf node_modules package-lock.json
npm install
```

---

## 🐳 Opción 3: Con Docker

### Requisitos
- Docker instalado
- Docker Compose instalado

### Inicio
```bash
cd prospectacion-ai
docker-compose up -d
```

### Acceder
- Frontend: http://localhost:3000
- Backend: http://localhost:5001

### Detener
```bash
docker-compose down
```

---

## 📚 Próximos Pasos

1. **Leer Documentación**: Ver `/docs` para guías completas
2. **Explorar Código**: Revisar estructura en `ESTRUCTURA.md`
3. **Configurar Integraciones**: Conectar OpenAI, MongoDB Atlas
4. **Desplegar**: Seguir `docs/DEPLOYMENT.md`

---

## 🤔 Preguntas Frecuentes

### ¿Puedo cambiar el puerto?
Sí, edita el archivo `.env` en backend o frontend.

### ¿Cómo agregar más usuarios?
1. Haz clic en "Sign Up" en la página de login
2. Completa el formulario
3. Usa la nueva cuenta

### ¿Dónde están los datos de MongoDB?
- **Local**: `C:\data\db` (Windows) o `/data/db` (Mac/Linux)
- **Atlas**: Dashboard en https://cloud.mongodb.com

### ¿Cómo depuro problemas?
1. Revisa la consola del backend: http://localhost:5001/api/v1
2. Abre DevTools en el navegador (F12)
3. Revisa logs en la terminal

---

## 🎓 Recursos de Ayuda

| Recurso | URL |
|---------|-----|
| Documentación | `/docs` |
| API Reference | `docs/API.md` |
| Architecture | `docs/ARQUITECTURA.md` |
| Development Guide | `docs/GUIA_DESARROLLO.md` |
| Deployment | `docs/DEPLOYMENT.md` |

---

## ✅ Checklist de Primeros Pasos

- [ ] Node.js v18+ instalado
- [ ] MongoDB corriendo
- [ ] API Key OpenAI obtenida
- [ ] Variables de entorno configuradas
- [ ] Backend iniciado (Puerto 5001)
- [ ] Frontend iniciado (Puerto 3000)
- [ ] Sesión iniciada en http://localhost:3000
- [ ] Explorado el Dashboard

---

## 🎉 ¡Listo!

Ahora tienes Prospectación AI corriendo localmente. 

**¿Qué sigue?**
- Crea algunos leads de prueba
- Experimenta con la IA
- Lee la documentación completa
- ¡Contribuye al proyecto!

---

## 📞 Soporte

- 📧 Email: support@prospectacion-ai.com
- 🐛 Issues: GitHub Issues
- 💬 Comunidad: Discord

---

**¡Bienvenido a Prospectación AI!** 🚀

**Última actualización**: Mayo 2024
