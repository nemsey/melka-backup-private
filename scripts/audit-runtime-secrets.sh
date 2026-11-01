#!/bin/bash
# Melka Council Guard — PN-043-A
set -euo pipefail

P1="upload/.runtime/boot-secrets.json"
P2="upload/.runtime"
P3="env.escrow.enc"

FOUND=0
[ -f "$P1" ] && FOUND=1 && echo "✅ Priority 1: $P1"
[ -d "$P2" ] && [ -n "$(ls -A $P2 2>/dev/null)" ] && FOUND=1 && echo "✅ Priority 2: $P2/"
[ -f "$P3" ] && FOUND=1 && echo "✅ Priority 3: $P3"

if [ $FOUND -eq 0 ]; then
  echo "❌ FATAL: No secret found in any persistent layer"
  exit 1
fi
exit 0
