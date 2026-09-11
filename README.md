# 🚀 Prospectación AI - Sistema Completo de Prospectación Automatizada

> **Plataforma SaaS enterprise-grade para automatizar prospectación en redes sociales con inteligencia artificial**

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Status](https://img.shields.io/badge/status-Production%20Ready-brightgreen)
![Node](https://img.shields.io/badge/node-18%2B-brightgreen)
![React](https://img.shields.io/badge/react-18%2B-61dafb)

Sistema profesional y moderno de prospectación automatizada para redes sociales, diseñado para network marketing, MLM y negocios digitales de alto volumen.

## 🎯 Visión

Crear un ecosistema automatizado que permita:
- ✅ Capturar leads desde redes sociales (Instagram, Facebook, TikTok, WhatsApp)
- ✅ Clasificar prospectos automáticamente con IA
- ✅ Automatizar conversaciones iniciales humanizadas
- ✅ Dar seguimiento inteligente con recordatorios
- ✅ Identificar prospectos calientes mediante scoring
- ✅ Gestionar embudos de conversión visuales (Kanban)
- ✅ Analizar métricas y comportamiento en tiempo real

## 🏗️ Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────────────┐
│                     FRONTEND (React)                         │
│  Dashboard | CRM | Lead Hunter | Analytics | Settings        │
└────────────────────┬────────────────────────────────────────┘
                     │
                ┌────▼──────────────────────────────────────┐
                │      API Gateway + Autenticación JWT      │
                └────┬──────────────────────────────────────┘
                     │
        ┌────────────┼────────────┬────────────┐
        │            │            │            │
   ┌────▼───┐  ┌────▼───┐  ┌────▼────┐  ┌───▼────┐
   │ Auth   │  │ Leads  │  │  IA     │  │ Social │
   │Module  │  │Module  │  │ Module  │  │Scraper │
   └────────┘  └────────┘  └─────────┘  └────────┘
        │
   ┌────▼──────────────────────────────────────┐
   │          MongoDB Atlas / Local            │
   │  Collections: users, leads, conversations │
   └───────────────────────────────────────────┘
        │
   ┌────▼──────────────────────────────────────┐
   │      Integraciones Externas               │
   │  OpenAI | Instagram | Facebook | WhatsApp │
   └───────────────────────────────────────────┘
```

## 📦 Stack Tecnológico

### Frontend
- **Framework**: React 18 + TypeScript
- **Styling**: TailwindCSS + Framer Motion
- **Estado**: React Query + Context API
- **Formularios**: React Hook Form
- **Charts**: Recharts
- **UI**: Componentes personalizados + Headless UI

### Backend
- **Runtime**: Node.js v18+
- **Framework**: Express.js
- **Base de Datos**: MongoDB
- **Autenticación**: JWT + bcrypt
- **Validación**: Joi/Zod
- **Email**: Nodemailer
- **IA**: OpenAI API
- **Task Queue**: Bull (para automatizaciones)

### DevOps & Deployment
- **Frontend**: Vercel
- **Backend**: Render.com
- **Base de Datos**: MongoDB Atlas
- **Versionado**: Git + GitHub
- **CI/CD**: GitHub Actions

## 📋 Funcionalidades Principales

### 1. Dashboard
- Estadísticas en tiempo real
- Leads capturados
- Conversaciones activas
- Tasa de respuesta
- Prospectos calientes
- Conversiones totales
- Calendario de seguimientos

### 2. CRM de Prospectos
- Gestión completa de leads
- Pipeline visual tipo Kanban
- Historial de conversaciones
- Etiquetas automáticas
- Sistema de notas
- Seguimientos programados

### 3. Lead Hunter
- Búsqueda automática de perfiles
- Filtrado inteligente
- Sistema de scoring (Frío/Tibio/Caliente)
- Análisis de biografía
- Detección de palabras clave

### 4. Social Scraper
- Análisis de hashtags
- Detección de reels virales
- Identificación de comentarios tipo "INFO"
- Métricas de engagement
- Tendencias por nicho

### 5. IA Lead Analyzer
- Análisis automático de perfiles
- Detección de intereses
- Generación de mensajes personalizados
- Análisis de emociones y objeciones
- Recomendaciones de contenido

### 6. Smart Outreach
- Mensajes humanizados
- Secuencias automáticas
- Personalización dinámica
- Follow-up inteligente
- Métricas de respuesta

### 7. Sistema de Automatizaciones
- Respuestas automáticas
- Recordatorios inteligentes
- Flujos de seguimiento
- Programación de mensajes

### 8. Notificaciones
- Alertas de nuevos leads
- Seguimientos pendientes
- Prospectos calientes
- Mensajes sin responder

## 🚀 Quick Start

### Requisitos
- Node.js v18+
- MongoDB (local o Atlas)
- Claves API (OpenAI)

### Instalación Frontend
```bash
cd frontend
npm install
npm run dev
```

### Instalación Backend
```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

### Variables de Entorno
```
# Backend (.env)
MONGO_URI=mongodb://...
JWT_SECRET=your-secret-key
OPENAI_API_KEY=sk-...
NODE_ENV=development
PORT=5001
```

## 📂 Estructura del Proyecto

```
prospectacion-ai/
├── frontend/                 # Aplicación React
│   ├── src/
│   │   ├── components/       # Componentes reutilizables
│   │   ├── pages/            # Páginas principales
│   │   ├── hooks/            # Custom hooks
│   │   ├── services/         # Servicios API
│   │   ├── context/          # Context API
│   │   ├── types/            # TypeScript types
│   │   └── utils/            # Utilidades
│   ├── package.json
│   └── tailwind.config.js
├── backend/                  # API Node.js
│   ├── src/
│   │   ├── controllers/      # Lógica de rutas
│   │   ├── models/           # Esquemas MongoDB
│   │   ├── routes/           # Definición de rutas
│   │   ├── middlewares/      # Middlewares
│   │   ├── services/         # Lógica de negocio
│   │   ├── utils/            # Utilidades
│   │   ├── config/           # Configuración
│   │   └── index.js          # Entry point
│   ├── package.json
│   └── .env.example
├── docs/                     # Documentación
│   ├── API.md
│   ├── ARQUITECTURA.md
│   ├── SETUP.md
│   └── GUIA_DESARROLLO.md
└── .github/                  # GitHub workflows

```

## 🔐 Seguridad

- ✅ Autenticación JWT
- ✅ Contraseñas hasheadas con bcrypt
- ✅ Rate limiting
- ✅ CORS configurado
- ✅ Validación de entrada
- ✅ Variables de entorno protegidas
- ✅ HTTPS en producción
- ✅ SQL Injection protection (MongoDB)

## 📊 Modelos de Datos

### User
```js
{
  _id, email, password (hashed), fullName, 
  avatar, role, createdAt, updatedAt
}
```

### Lead
```js
{
  _id, userId, username, platform, fullName, bio,
  followers, engagement, status, interestLevel, tags,
  lastContact, nextFollow-up, score, notes, createdAt
}
```

### Conversation
```js
{
  _id, leadId, userId, messages: [{sender, text, timestamp}],
  status, aiAnalysis, createdAt, updatedAt
}
```

### AutomationFlow
```js
{
  _id, userId, name, trigger, actions, schedule,
  isActive, createdAt, updatedAt
}
```

## 📈 Roadmap

- **v1.0**: MVP con Dashboard, CRM básico, IA simple
- **v1.5**: Lead Hunter + Social Scraper
- **v2.0**: Automatizaciones avanzadas + n8n integration
- **v2.5**: Integraciones nativas (Instagram, Facebook)
- **v3.0**: Mobile app + Advanced Analytics
- **v3.5**: Marketplace de templates + Integración Stripe

## 🤝 Contribución

Las contribuciones son bienvenidas. Por favor:
1. Fork el proyecto
2. Crea una rama feature
3. Commit tus cambios
4. Push a la rama
5. Abre un Pull Request

## 📝 Licencia

MIT License - ver LICENSE.md

## 📞 Soporte

- 📧 Email: support@prospectacion-ai.com
- 💬 Discord: [Servidor Comunidad]
- 🐛 Issues: GitHub Issues

---

**Hecho con ❤️ para emprendedores digitales**
