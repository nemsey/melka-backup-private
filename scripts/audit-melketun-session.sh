#!/bin/bash
# Guard: Melketun session cookies (if session-based) — PN-044-F2
# Law 12/18: session secrets live in Persistent Zone only — never in code/git/logs
set -uo pipefail
cd "$(dirname "$0")/.."

F="upload/.runtime/melketun-session.cookies"
if [ ! -f "$F" ]; then
  echo "ℹ️ no session file (might be token-based or not yet logged in)"
  exit 0
fi

# Must be gitignored
if ! git check-ignore -q "$F"; then
  echo "❌ session cookies not gitignored"
  exit 1
fi

# Must never be tracked in git history index
if git ls-files --error-unmatch "$F" >/dev/null 2>&1; then
  echo "❌ session cookies file is TRACKED by git"
  exit 1
fi

# Must never appear in any tracked source file (content scan of working tree secrets zones)
if git grep -lE "$(md5sum "$F" | cut -d' ' -f1)" -- . >/dev/null 2>&1; then
  echo "❌ session cookie md5 leaked into tracked files"
  exit 1
fi

echo "✅ melketun session safe (gitignored, untracked, persistent-zone only)"
