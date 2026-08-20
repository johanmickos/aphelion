#!/usr/bin/env bash
# Start the Vite dev server and print a scannable QR code for your phone.
#
#   ./tools/dev.sh [port]        (default 5173)
#
# The QR encodes this machine's LAN address, so pointing a phone camera at the
# terminal opens the game directly. Both devices must be on the same network.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
# shellcheck source=tools/lan-ip.sh
. "$ROOT/tools/lan-ip.sh"

PORT="${1:-5173}"

command -v pnpm >/dev/null 2>&1 || { echo "error: pnpm not found (brew install pnpm)" >&2; exit 1; }
[ -d node_modules ] || { echo "error: dependencies missing — run: pnpm install" >&2; exit 1; }

# Settle on a free port BEFORE printing the QR. Vite would otherwise move to a
# different port and the code on screen would point at nothing.
port_busy() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }
tries=0
while port_busy "$PORT" && [ "$tries" -lt 20 ]; do
  echo "port $PORT is in use, trying $((PORT + 1))..."
  PORT=$((PORT + 1))
  tries=$((tries + 1))
done

IP="$(lan_ip || true)"
if [ -z "$IP" ]; then
  echo "warning: could not detect a LAN IP — are you connected to Wi-Fi?" >&2
  IP="<this-machine's-ip>"
fi
URL="http://$IP:$PORT/"

echo
if [ "$IP" != "<this-machine's-ip>" ]; then
  python3 "$ROOT/tools/qr.py" "$URL" 2>/dev/null || \
    echo "  (QR unavailable — python3 not found; use the URL below)"
fi

cat <<EOT

  APHELION — dev server, hot reload

    On your phone:    $URL
    On this laptop:   http://localhost:$PORT/

  Tips
    - Edits under src/ hot-reload; no need to re-scan.
    - Add to Home Screen on iOS for a fullscreen, chrome-free test.
    - macOS may prompt to allow incoming connections the first time — allow it.
    - QR too small to scan?   python3 tools/qr.py --big "$URL"
    - Want it as an image?    python3 tools/qr.py --svg qr.svg "$URL"
    - The frozen prototype is index.html — open it directly, it needs no server.

  Ctrl-C to stop.

EOT

# --strictPort so Vite fails loudly rather than moving to a port the QR does not
# match. --host binds all interfaces so the phone can reach it.
exec pnpm exec vite --host --port "$PORT" --strictPort
