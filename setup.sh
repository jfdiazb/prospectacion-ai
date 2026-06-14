#!/bin/bash

# 🚀 Setup Script para Prospectación AI

echo "╔════════════════════════════════════════╗"
echo "║   Prospectación AI - Setup Script      ║"
echo "╚════════════════════════════════════════╝"
echo ""

# Colores
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Función para imprimir con color
print_step() {
    echo -e "${BLUE}▶${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# 1. Verificar Node.js
print_step "Verificando Node.js..."
if ! command -v node &> /dev/null; then
    print_warning "Node.js no está instalado"
    echo "Descargar desde: https://nodejs.org/"
    exit 1
fi
print_success "Node.js $(node -v) encontrado"

# 2. Verificar npm
print_step "Verificando npm..."
if ! command -v npm &> /dev/null; then
    print_warning "npm no está instalado"
    exit 1
fi
print_success "npm $(npm -v) encontrado"

# 3. Verificar MongoDB
print_step "Verificando MongoDB..."
if ! command -v mongod &> /dev/null; then
    print_warning "MongoDB no está instalado (recomendado para desarrollo local)"
    echo "O usa MongoDB Atlas: https://mongodb.com/cloud/atlas"
fi

# 4. Instalar dependencias Backend
print_step "Instalando dependencias del backend..."
cd backend
npm install
print_success "Backend dependencies instaladas"
cd ..

# 5. Configurar .env Backend
print_step "Configurando .env del backend..."
if [ ! -f "backend/.env" ]; then
    cp backend/.env.example backend/.env
    print_success "backend/.env creado"
    print_warning "⚠️  IMPORTANTE: Actualiza backend/.env con tus credenciales"
else
    print_success "backend/.env ya existe"
fi

# 6. Instalar dependencias Frontend
print_step "Instalando dependencias del frontend..."
cd frontend
npm install
print_success "Frontend dependencies instaladas"
cd ..

# 7. Configurar .env Frontend
print_step "Configurando .env del frontend..."
if [ ! -f "frontend/.env" ]; then
    cp frontend/.env.example frontend/.env
    print_success "frontend/.env creado"
fi

# 8. Mensajes finales
echo ""
echo "╔════════════════════════════════════════╗"
echo "║   ✅ Setup Completado!                 ║"
echo "╚════════════════════════════════════════╝"
echo ""
echo -e "${GREEN}Próximos pasos:${NC}"
echo ""
echo "1. Asegúrate que MongoDB está corriendo:"
echo "   ${BLUE}mongod${NC}"
echo ""
echo "2. Inicia el backend (en una terminal):"
echo "   ${BLUE}cd backend && npm run dev${NC}"
echo ""
echo "3. Inicia el frontend (en otra terminal):"
echo "   ${BLUE}cd frontend && npm run dev${NC}"
echo ""
echo "4. Abre en tu navegador:"
echo "   ${BLUE}http://localhost:3000${NC}"
echo ""
echo "📖 Para más información, ver:"
echo "   - docs/SETUP.md"
echo "   - docs/API.md"
echo "   - docs/ARQUITECTURA.md"
echo ""
