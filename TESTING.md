# 🧪 Guía de Testing

Documentación sobre estrategia de testing en Prospectación AI.

---

## 📋 Tabla de Contenidos

- [Estructura](#estructura)
- [Testing Backend](#testing-backend)
- [Testing Frontend](#testing-frontend)
- [Coverage Goals](#coverage-goals)
- [Ejecutar Tests](#ejecutar-tests)

---

## 🏗️ Estructura

```
project/
├── backend/
│   ├── src/
│   └── tests/              # ← Tests del backend
│       ├── unit/
│       ├── integration/
│       └── fixtures/
├── frontend/
│   ├── src/
│   └── __tests__/         # ← Tests del frontend
│       ├── components/
│       ├── hooks/
│       └── services/
```

---

## 🔧 Testing Backend

### Setup

```bash
cd backend
npm install --save-dev jest @types/jest ts-jest
npm install --save-dev supertest @types/supertest
```

### Estructura de Test

```typescript
// tests/unit/services/authService.test.ts
import { AuthService } from '../../../src/services/AuthService';
import { User } from '../../../src/models/User';

jest.mock('../../../src/models/User');

describe('AuthService', () => {
  let authService: AuthService;

  beforeEach(() => {
    authService = new AuthService();
  });

  describe('register', () => {
    it('should create a new user', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'testPassword123',
        fullName: 'Test User',
      };

      const result = await authService.register(userData);

      expect(result).toHaveProperty('_id');
      expect(result.email).toBe(userData.email);
      expect(User.create).toHaveBeenCalledWith(expect.objectContaining({
        email: userData.email,
      }));
    });

    it('should throw error if user already exists', async () => {
      // Arrange
      const userData = { email: 'existing@example.com', password: 'test123', fullName: 'Test' };
      User.findOne = jest.fn().mockResolvedValue({ email: userData.email });

      // Act & Assert
      await expect(authService.register(userData)).rejects.toThrow('User already exists');
    });
  });

  describe('login', () => {
    it('should return JWT token on successful login', async () => {
      // Arrange
      const credentials = { email: 'test@example.com', password: 'testPassword123' };
      const mockUser = { _id: '123', email: credentials.email, password: 'hashedPassword' };
      User.findOne = jest.fn().mockResolvedValue(mockUser);

      // Act
      const result = await authService.login(credentials);

      // Assert
      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('user');
    });
  });
});
```

### Tests de Integración

```typescript
// tests/integration/routes/authRoutes.test.ts
import request from 'supertest';
import app from '../../../src/index';
import { User } from '../../../src/models/User';

describe('Auth Routes', () => {
  beforeAll(async () => {
    // Setup test database
  });

  afterAll(async () => {
    // Cleanup
  });

  describe('POST /api/v1/auth/register', () => {
    it('should register a new user', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'newuser@example.com',
          password: 'SecurePass123',
          fullName: 'New User',
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('token');
      expect(response.body.user.email).toBe('newuser@example.com');
    });

    it('should return 400 if email already exists', async () => {
      await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'existing@example.com',
          password: 'SecurePass123',
          fullName: 'First User',
        });

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'existing@example.com',
          password: 'DifferentPass123',
          fullName: 'Second User',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('already exists');
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('should login successfully', async () => {
      // First, create a user
      await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'logintest@example.com',
          password: 'TestPass123',
          fullName: 'Login Tester',
        });

      // Then, attempt login
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'logintest@example.com',
          password: 'TestPass123',
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
    });
  });
});
```

### Fixtures para Testing

```typescript
// tests/fixtures/users.ts
export const mockUsers = {
  admin: {
    _id: '507f1f77bcf86cd799439011',
    email: 'admin@example.com',
    fullName: 'Admin User',
    role: 'admin',
  },
  user: {
    _id: '507f1f77bcf86cd799439012',
    email: 'user@example.com',
    fullName: 'Regular User',
    role: 'user',
  },
};

export const mockLeads = {
  hot: {
    _id: '607f1f77bcf86cd799439013',
    userId: mockUsers.user._id,
    username: '@hotprospect',
    platform: 'instagram',
    score: 85,
    interestLevel: 'hot',
  },
  cold: {
    _id: '607f1f77bcf86cd799439014',
    userId: mockUsers.user._id,
    username: '@coldprospect',
    platform: 'facebook',
    score: 20,
    interestLevel: 'cold',
  },
};
```

---

## ⚛️ Testing Frontend

### Setup

```bash
cd frontend
npm install --save-dev vitest @testing-library/react @testing-library/jest-dom
npm install --save-dev jsdom
```

### Configuración Vitest

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/__tests__/setup.ts',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

### Tests de Componentes

```typescript
// src/__tests__/components/Button.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '@/components/Button';

describe('Button', () => {
  it('renders button with text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('calls onClick handler when clicked', async () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click me</Button>);

    const button = screen.getByText('Click me');
    await userEvent.click(button);

    expect(handleClick).toHaveBeenCalledOnce();
  });

  it('renders disabled state', () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByText('Disabled')).toBeDisabled();
  });

  it('applies variant styling', () => {
    const { container } = render(<Button variant="primary">Primary</Button>);
    expect(container.querySelector('button')).toHaveClass('btn-primary');
  });
});
```

### Tests de Hooks

```typescript
// src/__tests__/hooks/useForm.test.ts
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useForm } from '@/hooks';

describe('useForm', () => {
  it('initializes with default values', () => {
    const { result } = renderHook(() =>
      useForm({ email: '', password: '' })
    );

    expect(result.current.values).toEqual({ email: '', password: '' });
  });

  it('updates field value', () => {
    const { result } = renderHook(() =>
      useForm({ email: '', password: '' })
    );

    act(() => {
      result.current.handleChange('email', 'test@example.com');
    });

    expect(result.current.values.email).toBe('test@example.com');
  });

  it('resets form values', () => {
    const { result } = renderHook(() =>
      useForm({ email: '', password: '' })
    );

    act(() => {
      result.current.handleChange('email', 'test@example.com');
      result.current.reset();
    });

    expect(result.current.values.email).toBe('');
  });
});
```

### Tests de Páginas

```typescript
// src/__tests__/pages/LoginPage.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginPage } from '@/pages/LoginPage';
import * as authService from '@/services/authService';

vi.mock('@/services/authService');
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

describe('LoginPage', () => {
  it('renders login form', () => {
    render(<LoginPage />);
    expect(screen.getByPlaceholderText('Email')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument();
  });

  it('submits form and logs in successfully', async () => {
    const user = userEvent.setup();
    vi.mocked(authService.login).mockResolvedValue({
      token: 'test-token',
      user: { _id: '1', email: 'test@example.com' },
    });

    render(<LoginPage />);

    await user.type(screen.getByPlaceholderText('Email'), 'test@example.com');
    await user.type(screen.getByPlaceholderText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: /login/i }));

    await waitFor(() => {
      expect(authService.login).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      });
    });
  });

  it('shows error on failed login', async () => {
    const user = userEvent.setup();
    vi.mocked(authService.login).mockRejectedValue(
      new Error('Invalid credentials')
    );

    render(<LoginPage />);

    await user.type(screen.getByPlaceholderText('Email'), 'test@example.com');
    await user.type(screen.getByPlaceholderText('Password'), 'wrongpass');
    await user.click(screen.getByRole('button', { name: /login/i }));

    await waitFor(() => {
      expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument();
    });
  });
});
```

---

## 📊 Coverage Goals

```
Global:
- Statements:   > 80%
- Branches:     > 75%
- Functions:    > 80%
- Lines:        > 80%

Critical Paths:
- Services:     > 90%
- Controllers:  > 85%
- Models:       > 85%

Frontend Components:
- Pages:        > 85%
- Components:   > 80%
- Hooks:        > 85%
```

### Generar Coverage Report

```bash
# Backend
npm run test:coverage

# Frontend
npm run test:coverage
```

---

## 🚀 Ejecutar Tests

### Backend

```bash
cd backend

# Todos los tests
npm test

# Tests en modo watch
npm run test:watch

# Tests con coverage
npm run test:coverage

# Solo tests unitarios
npm run test:unit

# Solo tests de integración
npm run test:integration
```

### Frontend

```bash
cd frontend

# Todos los tests
npm test

# Tests en modo watch
npm run test:watch

# Tests con coverage
npm run test:coverage
```

---

## 🔍 Best Practices

### Unit Testing

```typescript
// ✅ Correcto
describe('calculateLeadScore', () => {
  it('should return score between 0-100', () => {
    const result = calculateLeadScore({ followers: 1000, engagement: 0.5 });
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(100);
  });

  it('should give more weight to engagement', () => {
    const high_engagement = calculateLeadScore({ followers: 100, engagement: 0.9 });
    const high_followers = calculateLeadScore({ followers: 9000, engagement: 0.1 });
    expect(high_engagement).toBeGreaterThan(high_followers);
  });
});
```

### Naming Conventions

```typescript
// ✅ Correcto
describe('AuthService.register()', () => {
  it('should create a new user with hashed password', () => {});
  it('should return user object with token', () => {});
  it('should throw error if email already exists', () => {});
});

// ❌ Incorrecto
describe('auth', () => {
  it('works', () => {});
  it('test', () => {});
});
```

### Setup y Teardown

```typescript
// ✅ Correcto
describe('Database operations', () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  afterEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    await disconnectTestDB();
  });
});
```

---

## 🐛 Troubleshooting

### Tests Lento

- Usar mocks para dependencias externas
- Paralelizar tests
- Usar test fixtures en lugar de datos reales

### Tests Flakyness

- Evitar dependencias de tiempo (usar fake timers)
- Usar waitFor para operaciones async
- Limpiar estado entre tests

---

## 📚 Recursos

- [Jest Docs](https://jestjs.io/docs/getting-started)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [Vitest Docs](https://vitest.dev/)

---

**Última actualización**: Mayo 2024
