# @echo off
REM 🚀 Setup Script para Prospectación AI (Windows)

echo.
echo ╔════════════════════════════════════════╗
echo ║   Prospectacion AI - Setup Script      ║
echo ╚════════════════════════════════════════╝
echo.

REM 1. Verificar Node.js
echo ▶ Verificando Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ⚠ Node.js no está instalado
    echo Descargar desde: https://nodejs.org/
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version') do (echo ✓ %%i encontrado)

REM 2. Verificar npm
echo ▶ Verificando npm...
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ⚠ npm no está instalado
    exit /b 1
)
for /f "tokens=*" %%i in ('npm --version') do (echo ✓ npm %%i encontrado)

REM 3. Instalar Backend
echo ▶ Instalando dependencias del backend...
cd backend
call npm install
echo ✓ Backend dependencies instaladas
cd ..

REM 4. Configurar .env Backend
echo ▶ Configurando .env del backend...
if not exist "backend\.env" (
    copy backend\.env.example backend\.env
    echo ✓ backend\.env creado
    echo ⚠ IMPORTANTE: Actualiza backend\.env con tus credenciales
) else (
    echo ✓ backend\.env ya existe
)

REM 5. Instalar Frontend
echo ▶ Instalando dependencias del frontend...
cd frontend
call npm install
echo ✓ Frontend dependencies instaladas
cd ..

REM 6. Configurar .env Frontend
echo ▶ Configurando .env del frontend...
if not exist "frontend\.env" (
    copy frontend\.env.example frontend\.env
    echo ✓ frontend\.env creado
)

REM 7. Mensajes finales
echo.
echo ╔════════════════════════════════════════╗
echo ║   ✅ Setup Completado!                ║
echo ╚════════════════════════════════════════╝
echo.
echo Próximos pasos:
echo.
echo 1. Asegúrate que MongoDB está corriendo (en otra terminal):
echo    mongod
echo.
echo 2. Inicia el backend (en una terminal):
echo    cd backend ^&^& npm run dev
echo.
echo 3. Inicia el frontend (en otra terminal):
echo    cd frontend ^&^& npm run dev
echo.
echo 4. Abre en tu navegador:
echo    http://localhost:3000
echo.
echo Documentación:
echo    - docs/SETUP.md
echo    - docs/API.md
echo    - docs/ARQUITECTURA.md
echo.
pause
