#!/bin/bash
# ═══════════════════════════════════════════════════════
# setup-temperatura.sh
# ═══════════════════════════════════════════════════════
# Ejecutá este script ANTES de "npm run dev" para habilitar
# los datos reales de temperatura desde la base de datos MySQL.
#
# Esto copia los API routes a la carpeta app/api/ para que
# Next.js los sirva. NO ejecutar si estás haciendo deploy
# a GitHub Pages (solo para uso local).
# ═══════════════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"

echo "🔧 Configurando API de temperatura..."

# Crear directorios
mkdir -p "$PROJECT_DIR/app/api/temperatura/sensors"
mkdir -p "$PROJECT_DIR/app/api/temperatura/data"

# Copiar routes
cp "$PROJECT_DIR/server-api/temperatura/sensors-route.ts" "$PROJECT_DIR/app/api/temperatura/sensors/route.ts"
cp "$PROJECT_DIR/server-api/temperatura/data-route.ts" "$PROJECT_DIR/app/api/temperatura/data/route.ts"

echo "✅ API routes copiados a app/api/temperatura/"
echo ""
echo "📋 Antes de ejecutar 'npm run dev', verificá el archivo .env.local:"
echo ""
echo "   DB_HOST=192.168.150.31"
echo "   DB_PORT=3306"
echo "   DB_USER=root"
echo "   DB_PASS=(tu contraseña de MySQL)"
echo "   DB_NAME=(nombre de la base de datos)"
echo ""
echo "⚠️  Para volver a modo GitHub Pages (sin API routes), ejecutá:"
echo "   ./cleanup-temperatura.sh"
echo ""
echo "🚀 Ahora podés ejecutar: npm run dev"
