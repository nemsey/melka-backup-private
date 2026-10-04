#!/usr/bin/env bash
# P1-06 — استخراج «امضای DOM» یک صفحه (ساختار تگ + کلاس، بدون متن زمان‌محور)
# استفاده: dom-signature.sh <out.txt>
set -euo pipefail
OUT="${1:?مسیر خروجی}"
agent-browser eval "(() => {
const sig = (el, depth) => {
  if (depth > 18 || !el.tagName) return '';
  const cls = el.getAttribute && el.getAttribute('class') ? '.' + el.getAttribute('class').split(' ').slice(0, 12).join('.') : '';
  const kids = [...el.children].map(c => sig(c, depth + 1)).join('');
  return el.tagName.toLowerCase() + cls + (kids ? '|' + kids : '');
};
return sig(document.getElementById('root') ?? document.body, 0);
})()" --json > /tmp/_dom_raw.json
python3 - "$OUT" <<'PYEOF'
import json, sys
d = json.load(open("/tmp/_dom_raw.json"))
result = d.get("data", {}).get("result")
assert isinstance(result, str) and result, "نتیجه eval خواسته نشد"
open(sys.argv[1], "w").write(result)
print(f"امضا ذخیره شد: {sys.argv[1]} ({len(result)} نویسه)")
PYEOF
