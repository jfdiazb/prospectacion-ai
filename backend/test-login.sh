#!/bin/bash

# Script para probar el sistema de login

echo "=== Prueba de Login ==="
echo

# Configurar variables
BASE_URL="http://localhost:5001"
EMAIL="test@example.com"
PASSWORD="TestPassword123"
FULL_NAME="Test User"

echo "1. Registrando usuario..."
REGISTER_RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/auth/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$EMAIL\",
    \"password\": \"$PASSWORD\",
    \"fullName\": \"$FULL_NAME\"
  }")

echo "Respuesta de registro:"
echo "$REGISTER_RESPONSE" | jq '.' 2>/dev/null || echo "$REGISTER_RESPONSE"
echo

# Extraer token del registro
REGISTER_TOKEN=$(echo "$REGISTER_RESPONSE" | jq -r '.data.token' 2>/dev/null)

echo "2. Iniciando sesión con las mismas credenciales..."
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$EMAIL\",
    \"password\": \"$PASSWORD\"
  }")

echo "Respuesta de login:"
echo "$LOGIN_RESPONSE" | jq '.' 2>/dev/null || echo "$LOGIN_RESPONSE"
echo

# Extraer token del login
LOGIN_TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.data.token' 2>/dev/null)

echo "3. Obteniendo perfil con JWT..."
if [ ! -z "$LOGIN_TOKEN" ] && [ "$LOGIN_TOKEN" != "null" ]; then
  PROFILE_RESPONSE=$(curl -s -X GET "$BASE_URL/api/v1/auth/profile" \
    -H "Authorization: Bearer $LOGIN_TOKEN")
  
  echo "Respuesta de perfil:"
  echo "$PROFILE_RESPONSE" | jq '.' 2>/dev/null || echo "$PROFILE_RESPONSE"
else
  echo "No se pudo obtener token de login"
fi

echo
echo "=== Prueba completada ==="
