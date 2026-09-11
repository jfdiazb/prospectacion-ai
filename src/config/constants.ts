/**
 * Constantes de la aplicación
 */

export const CONSTANTS = {
  // Roles de usuarios
  ROLES: {
    ADMIN: 'admin',
    USER: 'user',
    TEAM_LEAD: 'team_lead',
  },

  // Estados de leads
  LEAD_STATUS: {
    NEW: 'new',
    CONTACTED: 'contacted',
    CONVERSATION_STARTED: 'conversation_started',
    INTERESTED: 'interested',
    PRESENTATION_SENT: 'presentation_sent',
    FOLLOW_UP: 'follow_up',
    HOT_PROSPECT: 'hot_prospect',
    REGISTERED: 'registered',
    REJECTED: 'rejected',
  },

  // Niveles de interés
  INTEREST_LEVELS: {
    COLD: 'cold',
    WARM: 'warm',
    HOT: 'hot',
  },

  // Plataformas sociales
  PLATFORMS: {
    INSTAGRAM: 'instagram',
    FACEBOOK: 'facebook',
    TIKTOK: 'tiktok',
    WHATSAPP: 'whatsapp',
    TELEGRAM: 'telegram',
  },

  // Tipos de mensajes
  MESSAGE_TYPES: {
    AUTO_RESPONSE: 'auto_response',
    MANUAL: 'manual',
    AI_GENERATED: 'ai_generated',
    SEQUENCE: 'sequence',
  },

  // Estados de conversación
  CONVERSATION_STATUS: {
    ACTIVE: 'active',
    PAUSED: 'paused',
    CLOSED: 'closed',
  },

  // Scoring de leads
  LEAD_SCORE_RANGES: {
    COLD: { min: 0, max: 30 },
    WARM: { min: 31, max: 70 },
    HOT: { min: 71, max: 100 },
  },

  // Límites de API
  RATE_LIMITS: {
    REQUESTS_PER_MINUTE: 60,
    REQUESTS_PER_HOUR: 1000,
  },

  // Tiempo de expiración de tokens
  TOKEN_EXPIRY: {
    ACCESS_TOKEN: '24h',
    REFRESH_TOKEN: '30d',
  },
};

export const MESSAGES = {
  SUCCESS: {
    LOGIN: 'Inicio de sesión exitoso',
    LOGOUT: 'Cierre de sesión exitoso',
    CREATED: 'Registro creado exitosamente',
    UPDATED: 'Registro actualizado exitosamente',
    DELETED: 'Registro eliminado exitosamente',
  },
  ERROR: {
    UNAUTHORIZED: 'No autorizado',
    FORBIDDEN: 'Acceso denegado',
    NOT_FOUND: 'Recurso no encontrado',
    VALIDATION_ERROR: 'Error de validación',
    SERVER_ERROR: 'Error interno del servidor',
    INVALID_CREDENTIALS: 'Credenciales inválidas',
    EMAIL_ALREADY_EXISTS: 'El email ya está registrado',
    WEAK_PASSWORD: 'La contraseña es muy débil',
  },
};

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_ERROR: 500,
};
