#!/usr/bin/env bash
# ─────────────────────────────────────────────
# LAD Dev Launcher
# Starts Flask backend + Vite frontend together
# Usage: ./start.sh
# ─────────────────────────────────────────────

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/dashboard"

# Colours
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

cleanup() {
  echo -e "\n${YELLOW}Shutting down...${NC}"
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null
  wait "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null
  echo -e "${GREEN}Done.${NC}"
}
trap cleanup INT TERM

# ── Backend ──────────────────────────────────
echo -e "${CYAN}[backend]${NC} Activating venv and starting Flask..."

cd "$BACKEND" || { echo "ERROR: backend dir not found"; exit 1; }

if [ ! -f "venv/bin/activate" ]; then
  echo "ERROR: venv not found at $BACKEND/venv"
  exit 1
fi

source venv/bin/activate

FLASK_APP=app FLASK_ENV=development flask run &
BACKEND_PID=$!
echo -e "${CYAN}[backend]${NC} PID $BACKEND_PID — http://127.0.0.1:5000"

# ── Frontend ─────────────────────────────────
echo -e "${CYAN}[frontend]${NC} Starting Vite dev server..."

cd "$FRONTEND" || { echo "ERROR: dashboard dir not found"; exit 1; }

npm run dev &
FRONTEND_PID=$!
echo -e "${CYAN}[frontend]${NC} PID $FRONTEND_PID — http://localhost:5173"

# ── Wait ─────────────────────────────────────
echo -e "\n${GREEN}Both services running. Press Ctrl+C to stop.${NC}\n"
wait "$BACKEND_PID" "$FRONTEND_PID"
