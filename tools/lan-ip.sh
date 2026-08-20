# Shared LAN IP detection. Sourced by serve.sh and start-ts.sh so the two cannot
# drift apart — the fallback chain below is the fiddly part.
#
#   . tools/lan-ip.sh ; IP="$(lan_ip)"

lan_ip() {
  local iface ip
  # Prefer whichever interface holds the default route, so this follows you
  # between Wi-Fi and Ethernet rather than hardcoding en0.
  iface="$(route -n get default 2>/dev/null | awk '/interface:/{print $2; exit}')"
  for iface in "$iface" en0 en1 en2 en3; do
    [ -n "$iface" ] || continue
    ip="$(ipconfig getifaddr "$iface" 2>/dev/null || true)"
    [ -n "$ip" ] && { echo "$ip"; return; }
  done
  # Linux / no ipconfig
  if command -v ip >/dev/null 2>&1; then
    ip="$(ip -4 -o addr show scope global 2>/dev/null | awk '{print $4}' | cut -d/ -f1 | head -1)"
    [ -n "$ip" ] && { echo "$ip"; return; }
  fi
  ifconfig 2>/dev/null | awk '/inet /{ if ($2 != "127.0.0.1") { print $2; exit } }'
}
