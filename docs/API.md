# API Reference - Prospectación AI

## Base URL
```
http://localhost:5001/api/v1
```

## Authentication
Todos los endpoints (excepto auth públicos) requieren JWT en header:
```
Authorization: Bearer YOUR_JWT_TOKEN
```

---

## 📌 Authentication Endpoints

### Register
**POST** `/auth/register`

```json
{
  "email": "user@example.com",
  "password": "securePassword123",
  "fullName": "Juan Pérez"
}
```

**Response (201)**
```json
{
  "success": true,
  "message": "Registro creado exitosamente",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "_id": "507f1f77bcf86cd799439011",
      "email": "user@example.com",
      "fullName": "Juan Pérez",
      "role": "user"
    }
  }
}
```

### Login
**POST** `/auth/login`

```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Response (200)**
```json
{
  "success": true,
  "message": "Inicio de sesión exitoso",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": { ... }
  }
}
```

### Get Profile
**GET** `/auth/profile`

**Response (200)**
```json
{
  "success": true,
  "message": "Perfil obtenido",
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "email": "user@example.com",
    "fullName": "Juan Pérez",
    "role": "user",
    "plan": "professional"
  }
}
```

### Update Profile
**PUT** `/auth/profile`

```json
{
  "fullName": "Juan Carlos Pérez",
  "avatar": "https://...",
  "phone": "+541234567890"
}
```

---

## 👥 Leads Endpoints

### Create Lead
**POST** `/leads`

```json
{
  "username": "@juanperez",
  "platform": "instagram",
  "fullName": "Juan Pérez",
  "bio": "Emprendedor digital 💼 Network marketing",
  "followers": 5001,
  "engagement": 0.08,
  "email": "juan@example.com",
  "phone": "+541234567890"
}
```

**Response (201)**
```json
{
  "success": true,
  "message": "Registro creado exitosamente",
  "data": {
    "_id": "507f1f77bcf86cd799439012",
    "userId": "507f1f77bcf86cd799439011",
    "username": "@juanperez",
    "platform": "instagram",
    "score": 65,
    "interestLevel": "warm",
    "status": "new",
    "tags": [],
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

### Get All Leads
**GET** `/leads?page=1&limit=20`

**Response (200)**
```json
{
  "success": true,
  "message": "Leads obtenidos",
  "data": {
    "data": [ ... ],
    "total": 150,
    "page": 1,
    "limit": 20,
    "pages": 8
  }
}
```

### Get Hot Leads
**GET** `/leads/hot`

**Response (200)**
```json
{
  "success": true,
  "message": "Leads calientes obtenidos",
  "data": [
    {
      "_id": "507f...",
      "username": "@hotuser",
      "score": 85,
      "interestLevel": "hot",
      ...
    }
  ]
}
```

### Get Lead by ID
**GET** `/leads/:id`

### Update Lead
**PUT** `/leads/:id`

```json
{
  "bio": "Nueva bio",
  "tags": ["emprendedor", "networking"],
  "notes": "Muy interesado"
}
```

### Delete Lead
**DELETE** `/leads/:id`

### Update Lead Status
**PUT** `/leads/:id/status`

```json
{
  "status": "conversation_started"
}
```

### Get Leads by Status
**GET** `/leads/status/:status`

### Lead Stats
**GET** `/leads/stats`

**Response (200)**
```json
{
  "success": true,
  "message": "Estadísticas obtenidas",
  "data": {
    "totalLeads": 150,
    "newLeads": 25,
    "hotLeads": 15,
    "registeredLeads": 8,
    "conversionRate": 5.33
  }
}
```

### Advanced Search
**POST** `/leads/search`

```json
{
  "status": "hot_prospect",
  "platform": "instagram",
  "interestLevel": "hot",
  "minFollowers": 1000,
  "maxFollowers": 100000,
  "searchTerm": "emprendedor"
}
```

---

## 🤖 AI Endpoints

### Generate Personalized Message
**POST** `/ai/generate-message`

```json
{
  "username": "@juanperez",
  "bio": "Emprendedor digital",
  "platform": "instagram",
  "interestLevel": "warm"
}
```

**Response (200)**
```json
{
  "success": true,
  "message": "Mensaje generado",
  "data": "Hola Juan! 👋 He visto que estás en el mundo del emprendimiento digital. Me encantaría conectar contigo y compartir estrategias que estoy usando 💪"
}
```

### Analyze Sentiment
**POST** `/ai/analyze-sentiment`

```json
{
  "message": "Me encantaría saber más sobre esto! Dime cómo puedo comenzar 😊"
}
```

**Response (200)**
```json
{
  "success": true,
  "message": "Análisis completado",
  "data": {
    "sentiment": "positive",
    "score": 0.95,
    "explanation": "El mensaje muestra entusiasmo e interés positivo"
  }
}
```

### Detect Intent
**POST** `/ai/detect-intent`

```json
{
  "message": "¿Cuánto cuesta? ¿Hay opciones de pago?"
}
```

**Response (200)**
```json
{
  "success": true,
  "message": "Intención detectada",
  "data": {
    "intent": "consulta",
    "confidence": 0.92,
    "suggestedAction": "Responder con información de precios y opciones de pago"
  }
}
```

### Generate Objection Response
**POST** `/ai/objection-response`

```json
{
  "objection": "Es muy caro, no tengo presupuesto",
  "context": "Usuario con 5001 seguidores, engagement moderado"
}
```

**Response (200)**
```json
{
  "success": true,
  "message": "Respuesta generada",
  "data": "Entiendo perfectamente tu posición. Te cuento que muchos de nuestros clientes comenzaron viendo esto como una inversión. Con los resultados que otros están obteniendo, el ROI se recupera en promedio en 30 días... ¿Te gustaría ver un caso de éxito similar al tuyo?"
}
```

### Analyze Profile
**POST** `/ai/analyze-profile`

```json
{
  "bio": "Emprendedor | Network Marketing | Busco talentos 💼",
  "followers": 8000,
  "engagementRate": 0.12,
  "recentPosts": [
    "Post sobre oportunidades de negocio",
    "Testimonio de ganancias"
  ]
}
```

**Response (200)**
```json
{
  "success": true,
  "message": "Perfil analizado",
  "data": {
    "profileType": "Network Marketing Recruiter",
    "interests": ["emprendimiento", "network", "generación de ingresos"],
    "recommendedApproach": "Abordaje directo sobre oportunidades y casos de éxito",
    "score": 78
  }
}
```

### Generate Viral Content Ideas
**POST** `/ai/viral-ideas`

```json
{
  "niche": "network marketing",
  "count": 5
}
```

**Response (200)**
```json
{
  "success": true,
  "message": "Ideas generadas",
  "data": [
    "Comparación antes/después de ingresos 💰 (Antes: $500/mes → Ahora: $5001/mes)",
    "Secretos que los emprendedores exitosos nunca te contarán 🤫",
    "5 sistemas que usan para escalar su red en 30 días ⚡"
  ]
}
```

---

## Error Handling

### Common Error Codes

```json
{
  "400": "Bad Request - Validación fallida",
  "401": "Unauthorized - Token inválido o expirado",
  "403": "Forbidden - Acceso denegado",
  "404": "Not Found - Recurso no encontrado",
  "409": "Conflict - Email ya existe",
  "500": "Internal Server Error"
}
```

### Error Response Example
```json
{
  "success": false,
  "message": "El email ya está registrado",
  "error": "Validation error"
}
```

---

## Rate Limiting

- **General**: 100 requests / 15 minutos
- **Login**: 5 intentos / 15 minutos
- **API**: 30 requests / minuto

---

## Postman Collection

Importa la colección desde:
`docs/postman-collection.json`

---

## Webhooks (Futuro)

Se agregarán webhooks para:
- Nuevos leads detectados
- Cambios de estado
- Mensajes recibidos
