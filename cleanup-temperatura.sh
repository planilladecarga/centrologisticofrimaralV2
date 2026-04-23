#!/bin/bash
# ═══════════════════════════════════════════════════════
# cleanup-temperatura.sh
# ═══════════════════════════════════════════════════════
# Ejecutá este script para remover los API routes de temperatura
# antes de hacer deploy a GitHub Pages.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "🧹 Removiendo API routes de temperatura..."

rm -rf "$SCRIPT_DIR/app/api/temperatura"

echo "✅ Listo. Ahora podés hacer build para GitHub Pages."
