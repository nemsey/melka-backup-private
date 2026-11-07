#!/bin/bash
# PN-044 Phase 0.3.5b — Data pages probe WITH authenticated session + Inertia data-page extraction
set -uo pipefail
cd /home/z/my-project
LOG=download/pn044/recon.log
echo "" | tee -a "$LOG"
echo "=== 0.3.5b: Data pages with authenticated session ===" | tee -a "$LOG"

# Data pages from Ziggy route map (candidate modules for M1-M4)
PAGES=(
  "/Melketunfilingplus"
  "/MelketunPublicFilingPlus"
  "/Potentials"
  "/leads"
  "/contacts/all"
  "/specialists"
  "/specialists/valuations"
  "/supports"
  "/supports/valuations"
  "/attendances"
  "/notifications"
  "/admin/valuations"
  "/admin/branches"
  "/admin/users"
  "/courses"
  "/content_creations"
  "/specialists/services"
)
for PAGE in "${PAGES[@]}"; do
  CODE=$(curl -sS -o "/tmp/mk-page$(echo "$PAGE" | tr '/' '_').html" -w "%{http_code}" \
    -b /tmp/melketun-cookies.txt "https://melketun.app${PAGE}" --max-time 20 2>/dev/null || echo "000")
  echo "melketun.app${PAGE} → ${CODE}" | tee -a "$LOG"
done

# Extract data-page JSON component names + list lengths for each 200 page
echo "" | tee -a "$LOG"
echo "--- Inertia data-page analysis (200 pages) ---" | tee -a "$LOG"
for f in /tmp/mk-page*.html; do
  CODE_OK=$(grep -c 'id="app" data-page' "$f" 2>/dev/null || true)
  [ "$CODE_OK" = "0" ] && continue
  python3 - "$f" <<'PYEOF' 2>/dev/null
import re, json, html as h, sys
raw = open(sys.argv[1], encoding='utf-8', errors='replace').read()
m = re.search(r'id="app" data-page="([^"]*)"', raw)
if not m: sys.exit()
d = json.loads(h.unescape(m.group(1)))
comp = d.get('component', '?')
props = d.get('props', {})
url = d.get('url', '')
summary = []
def scan(o, prefix=''):
    if isinstance(o, dict):
        for k, v in list(o.items())[:12]:
            if isinstance(v, list):
                summary.append(f'{prefix}{k}: list[{len(v)}]' + (f' keys={list(v[0].keys())[:8]}' if v and isinstance(v[0], dict) else ''))
            elif isinstance(v, dict):
                scan(v, f'{prefix}{k}.')
            elif isinstance(v, (int, float)):
                summary.append(f'{prefix}{k}={v}')
print(f'[{url}] component={comp}')
for s in summary[:14]: print('   ', s)
PYEOF
done | tee -a "$LOG"
echo "0.3.5b DONE"
