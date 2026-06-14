# 🔒 Política de Seguridad

## Reportar Vulnerabilidades de Seguridad

**No abras issues públicos para problemas de seguridad.**

Si descubriste una vulnerabilidad de seguridad, por favor envía un correo a:
security@prospectacion-ai.com

Incluye:
- Descripción detallada de la vulnerabilidad
- Pasos para reproducirla
- Posible impacto
- Sugerencias de remediación (si las tienes)

Te responderemos en 48 horas.

---

## ✅ Prácticas de Seguridad

### Autenticación y Autorización

- ✅ **JWT Tokens**: Tokens con expiración de 24 horas
- ✅ **Password Hashing**: Bcrypt con salt rounds = 10
- ✅ **Role-based Access Control**: Roles de usuario definidos
- ✅ **Ownership Validation**: Validación de propiedad de recursos

### Validación de Entrada

- ✅ **Input Sanitization**: Sanitización en todos los endpoints
- ✅ **Type Validation**: TypeScript strict mode
- ✅ **Email Validation**: Validación de formato de email
- ✅ **Length Limits**: Límites de longitud en campos

### Rate Limiting

```
- General API: 100 requests / 15 minutos
- Login endpoint: 5 intentos / 15 minutos
- AI endpoints: 30 requests / 60 segundos
```

### CORS Configuration

```typescript
// Solo permite requests desde dominios específicos
const corsOptions = {
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
  optionsSuccessStatus: 200
};
```

### Headers de Seguridad

- ✅ **Helmet.js**: Headers de seguridad automáticos
- ✅ **X-Content-Type-Options**: Previene MIME type sniffing
- ✅ **X-Frame-Options**: Previene clickjacking
- ✅ **Content-Security-Policy**: Restringir recursos

### HTTPS

- ✅ Requerido en producción
- ✅ Redirección automática de HTTP → HTTPS
- ✅ SSL/TLS con Let's Encrypt

### Base de Datos

- ✅ **MongoDB Injection Prevention**: Mongoose escapa automáticamente
- ✅ **Connection Security**: MongoDB Atlas with IP whitelist
- ✅ **Encryption at Rest**: Habilitado en MongoDB Atlas
- ✅ **Encryption in Transit**: TLS/SSL enabled

### API Security

- ✅ **No sensitive data in logs**: Passwords y tokens no se loguean
- ✅ **Error messages generic**: Mensajes de error no revelan sistema
- ✅ **API versioning**: /api/v1 para control de cambios
- ✅ **Request size limits**: 10MB máximo en requests

### Frontend Security

- ✅ **XSS Prevention**: Sanitización automática de React
- ✅ **CSRF Protection**: Token-based CSRF
- ✅ **Content Security Policy**: Headers CSP configurados
- ✅ **Secure Storage**: JWT en localStorage (no cookies por ahora)

---

## 🔐 Secretos y Configuración

### Variables de Entorno Sensibles

Nunca comitees:
- `JWT_SECRET`
- `OPENAI_API_KEY`
- `MONGO_URI` con credenciales
- `SMTP_PASS`
- Cualquier API key

Usa `.env` local y `.env.example` con placeholders.

### Rotación de Secretos

En producción, rotar:
- JWT_SECRET cada 3 meses
- API keys cada 6 meses
- Database credentials según política

### SSH Keys

- ✅ SSH keys para clonación
- ✅ Proteger con passphrase
- ✅ No compartir claves públicas/privadas

---

## 🚨 Incidentes de Seguridad

### Plan de Respuesta

1. **Identificación**: Detectar y confirmar la vulnerabilidad
2. **Contención**: Mitigar el impacto inmediato
3. **Investigación**: Determinar alcance y causa
4. **Remediación**: Implementar fix
5. **Comunicación**: Notificar a usuarios afectados
6. **Post-mortem**: Analizar y prevenir recurrencia

### Comunicación

- Respuesta inicial: 48 horas
- Status updates: Cada 72 horas si aplica
- Resolución: Cuando esté completamente fixed

---

## 🔍 Auditoría de Seguridad

### Checklists Regulares

- [ ] Revisar dependencies vulnerables (`npm audit`)
- [ ] Actualizar packages regularmente
- [ ] Revisar logs de acceso
- [ ] Validar configuración de CORS
- [ ] Revisar permisos de archivos
- [ ] Verificar SSL/TLS setup
- [ ] Auditar access control
- [ ] Revisar rate limiting

### Herramientas

```bash
# Vulnerabilidades en dependencias
npm audit
npm audit fix

# SAST (Static Application Security Testing)
npm run lint

# Security headers check
https://securityheaders.com

# SSL/TLS check
https://www.ssllabs.com/ssltest/
```

---

## 📚 Recursos de Seguridad

- [OWASP Top 10](https://owasp.org/Top10)
- [Node.js Security Checklist](https://nodejs.org/en/docs/guides/security/)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [MongoDB Security](https://docs.mongodb.com/manual/security/)
- [React Security](https://react.dev/reference/react-dom/dangerouslySetInnerHTML)

---

## 🎓 Educación en Seguridad

Todos los contribuidores deben estar familiarizados con:
- OWASP Top 10
- Principios de seguridad de la aplicación
- Prácticas de coding seguro
- Manejo de datos sensibles

---

## ⚠️ Disclaimer

Este proyecto es provisto "tal cual". Los autores no son responsables por:
- Pérdida de datos
- Acceso no autorizado
- Cualquier daño resultante del uso

Realiza tus propias auditorías antes de usar en producción crítica.

---

## Versión

Última actualización: Mayo 2024  
Versión de Política: 1.0
