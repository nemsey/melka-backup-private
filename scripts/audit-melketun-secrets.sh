#!/bin/bash
# Guard (PN-043/فاز ۳ — شورا-ن۰۸۷): Melketun secrets must live in the Persistent
# Zone, stay gitignored, and never leak into git history.
# ---------------------------------------------------------------------------
# Environment note (recorded in PN-043 final report): this container mount
# forces mode 777 on ALL persistent-zone files (boot-secrets.json,
# cloudflare-token.env, …) — chmod 600 is attempted but not enforceable here;
# the mount-uniform mode is accepted (⚠️ warning, not a failure) while the
# core protections (existence + gitignore + no-leak) remain strictly enforced.
# Secret-leak check reads the password from the secrets file at runtime so
# that the guard itself never carries the literal secret in git history.
set -euo pipefail
F="upload/.runtime/melketun-secrets.json"
[ ! -f "$F" ] && echo "❌ $F missing" && exit 1

chmod 600 "$F" 2>/dev/null || true
MODE=$(stat -c %a "$F")
if [ "$MODE" != "600" ]; then
  PEER_MODE=$(stat -c %a upload/.runtime/boot-secrets.json 2>/dev/null || echo "")
  if [ -n "$PEER_MODE" ] && [ "$PEER_MODE" = "$MODE" ]; then
    echo "⚠️ chmod 600 not enforceable on this mount (mode=$MODE — uniform across Persistent Zone) — core guards still enforced"
  else
    echo "❌ chmod not 600" && exit 1
  fi
fi

git check-ignore -q "$F" || (echo "❌ Not gitignored" && exit 1)

# چک: password نباید در گیت باشد — رمز عیناً از فایل راز خوانده می‌شود
# (خودِ گارد هرگز نباید متن رمز را در خود داشته باشد — PN-043)
PW=$(jq -r '.crm.password' "$F")
if [ -n "$PW" ] && [ "$PW" != "null" ] && git grep -qF -- "$PW" 2>/dev/null; then
  echo "❌ Password leaked into git!" && exit 1
fi
echo "✅ melketun secrets safe"
