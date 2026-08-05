@echo off
REM Script para probar el sistema de login

setlocal enabledelayedexpansion

echo === Prueba de Login ===
echo.

set BASE_URL=http://localhost:5001
set EMAIL=test@example.com
set PASSWORD=TestPassword123
set FULL_NAME=Test User

echo 1. Registrando usuario...
curl -X POST "%BASE_URL%/api/v1/auth/register" ^
  -H "Content-Type: application/json" ^
  -d "{\"email\": \"%EMAIL%\", \"password\": \"%PASSWORD%\", \"fullName\": \"%FULL_NAME%\"}"

echo.
echo 2. Iniciando sesion con las mismas credenciales...
curl -X POST "%BASE_URL%/api/v1/auth/login" ^
  -H "Content-Type: application/json" ^
  -d "{\"email\": \"%EMAIL%\", \"password\": \"%PASSWORD%\"}"

echo.
echo === Prueba completada ===
pause
