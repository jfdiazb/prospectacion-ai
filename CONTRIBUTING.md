# 🤝 Guía de Contribución

¡Gracias por tu interés en contribuir a Prospectación AI! Este documento te guiará a través del proceso.

## 📋 Tabla de Contenidos

- [Código de Conducta](#código-de-conducta)
- [Cómo Contribuir](#cómo-contribuir)
- [Proceso de Pull Request](#proceso-de-pull-request)
- [Estándares de Código](#estándares-de-código)
- [Reportar Bugs](#reportar-bugs)
- [Sugerir Mejoras](#sugerir-mejoras)

---

## 📖 Código de Conducta

### Nuestro Compromiso

En interés de fomentar un ambiente abierto y acogedor, nosotros, como contribuyentes y mantenedores, nos comprometemos a hacer que la participación en nuestro proyecto y nuestra comunidad sea una experiencia libre de acoso para todos, independientemente de:

- Edad
- Tamaño corporal
- Discapacidad
- Etnia
- Identidad y expresión de género
- Nivel de experiencia
- Nacionalidad
- Apariencia personal
- Raza
- Religión
- Identidad y orientación sexual

### Nuestros Estándares

Los ejemplos de comportamiento que contribuyen a crear un ambiente positivo incluyen:

- Usar lenguaje acogedor e inclusivo
- Ser respetuoso con puntos de vista y experiencias diferentes
- Aceptar crítica constructiva con gracia
- Enfocarse en lo que es mejor para la comunidad
- Mostrar empatía hacia otros miembros de la comunidad

### Aplicación

Las instancias de abuso, acoso u otro comportamiento inaceptable pueden ser reportadas a la dirección de correo del proyecto.

---

## 🎯 Cómo Contribuir

### Para Principiantes

Si es tu primera vez contribuyendo, aquí hay algunos recursos para ayudarte:

- [Primeras Contribuciones](https://github.com/firstcontributions/first-contributions)
- [GitHub Guides](https://guides.github.com/)

### Proceso General

1. **Fork** el repositorio
2. **Clone** tu fork localmente
3. **Crea una rama** para tu feature (`git checkout -b feature/amazing-feature`)
4. **Haz commits** descriptivos (`git commit -m 'feat: add amazing feature'`)
5. **Push** a tu rama (`git push origin feature/amazing-feature`)
6. **Abre un Pull Request** describiendo los cambios

---

## 🔄 Proceso de Pull Request

### Antes de Enviar

1. Actualiza tu rama con la última versión de `main`
2. Asegúrate de que tu código cumple con los estándares
3. Escribe o actualiza tests si es necesario
4. Actualiza la documentación si es necesario
5. Realiza un auto-review de tus cambios

### Descripción del PR

```markdown
## Descripción
Describe brevemente qué cambios realiza este PR.

## Tipo de cambio
- [ ] Bug fix
- [ ] Nueva feature
- [ ] Breaking change
- [ ] Mejora de documentación

## Checklist
- [ ] Mi código sigue el estándar de código del proyecto
- [ ] He actualizado la documentación
- [ ] He agregado/actualizado tests
- [ ] No hay warnings de linting
- [ ] Mi cambio no introduce breaking changes

## Testing
Describe cómo testeaste los cambios.

## Screenshots (si aplica)
Agrega screenshots de UI changes.
```

---

## 📝 Estándares de Código

### TypeScript

```typescript
// ✅ Correcto
interface UserProfile {
  id: string;
  email: string;
  fullName: string;
}

const getUserProfile = async (userId: string): Promise<UserProfile> => {
  try {
    const response = await api.get(`/users/${userId}`);
    return response.data;
  } catch (error) {
    logger.error('Failed to fetch user profile', error);
    throw error;
  }
};

// ❌ Incorrecto
const getUserProfile = async (userId) => {
  return api.get(`/users/${userId}`).then(r => r.data);
};
```

### React

```typescript
// ✅ Correcto
interface UserCardProps {
  username: string;
  email: string;
  onAction?: (id: string) => void;
}

export const UserCard: React.FC<UserCardProps> = ({ 
  username, 
  email, 
  onAction 
}) => {
  const [isLoading, setIsLoading] = useState(false);
  
  return (
    <div className="user-card">
      <h2>{username}</h2>
      <p>{email}</p>
    </div>
  );
};

// ❌ Incorrecto
export default function UserCard(props) {
  return <div>{props.username}</div>;
}
```

### Naming Conventions

```typescript
// ✅ Correcto
// Variables
const user = { name: 'Juan' };
const isLoading = false;
const userEmail = 'juan@example.com';

// Funciones
function getUserById(id: string) {}
function calculateLeadScore(lead: Lead) {}

// Componentes
export const UserProfile = () => {};
export const LeadCard = () => {};

// Constants
const MAX_RETRIES = 3;
const API_TIMEOUT = 5001;
```

### Comentarios

```typescript
// ✅ Correcto
// Calcula el score del lead basado en múltiples factores
const calculateLeadScore = (lead: Lead): number => {
  return lead.followers * 0.3 + lead.engagement * 0.7;
};

// ✅ Para cosas complejas
/**
 * Calcula el score de un lead basado en:
 * - Número de followers (30%)
 * - Engagement rate (70%)
 * @param lead - Objeto lead con datos
 * @returns Score entre 0-100
 */
const calculateLeadScore = (lead: Lead): number => {};

// ❌ Incorrecto - obviamente innecesario
const x = 5; // asigna 5 a x
```

### Imports

```typescript
// ✅ Correcto
import { useState, useEffect } from 'react';
import type { User } from '@/types';
import { Button } from '@/components/Button';
import { getUserById } from '@/services/userService';

// ❌ Incorrecto
import * as React from 'react';
import UserComponent from './components/UserComponent';
import { getUserById, getAllUsers, deleteUser } from '@/services/userService';
```

---

## 🐛 Reportar Bugs

### Antes de Reportar

- Revisa la lista de [Issues](https://github.com/yourrepo/issues) existentes
- Prueba en la última versión
- Recopila información de debug

### Cómo Reportar

```markdown
**Descripción del Bug**
Descripción clara y concisa del bug.

**Pasos para Reproducir**
1. Ve a '...'
2. Haz clic en '...'
3. Observa el error '...'

**Comportamiento Esperado**
Qué debería suceder.

**Comportamiento Actual**
Qué sucede en realidad.

**Entorno**
- OS: [e.g., iOS]
- Navegador: [e.g., Chrome]
- Versión: [e.g., 1.0.0]

**Screenshots**
Si aplica, agrega screenshots.

**Logs**
Copia de logs relevantes.
```

---

## 💡 Sugerir Mejoras

```markdown
**Es tu mejora relacionada a un problema?**
Descripción clara del problema.

**Describe la mejora que te gustaría**
Descripción clara de qué debería suceder.

**Describe las alternativas consideradas**
Otras soluciones que consideraste.

**Contexto Adicional**
Información adicional o screenshots.
```

---

## 🎓 Aprender Más

### Recursos Útiles

- [Documentación del Proyecto](../docs/)
- [Guía de Desarrollo](../docs/GUIA_DESARROLLO.md)
- [Arquitectura del Sistema](../docs/ARQUITECTURA.md)
- [API Reference](../docs/API.md)

### Stack Tecnológico

- [React Docs](https://react.dev)
- [TypeScript Docs](https://www.typescriptlang.org/docs/)
- [Express Docs](https://expressjs.com)
- [MongoDB Docs](https://docs.mongodb.com)

---

## ✅ Checklist antes de enviar PR

- [ ] Mi código cumple con los estándares de estilo
- [ ] He actualizado la documentación necesaria
- [ ] He agregado tests si es necesario
- [ ] He corrido linting localmente (`npm run lint`)
- [ ] He corrido prettier (`npm run format`)
- [ ] No hay console.log o console.error de debug
- [ ] He probado en navegadores modernos
- [ ] Mi PR tiene una descripción clara

---

## 🎁 Reconocimientos

Agradecemos a todos los que contribuyen a hacer este proyecto mejor. Tú eres genial! 🌟

---

**¡Gracias por contribuir a Prospectación AI!**
