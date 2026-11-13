#!/usr/bin/env python3
"""Fix A-4 assertion (pn035) + matrix audit pin for the snapshotted drain_spool."""
BS = chr(92)
Q = chr(39)  # single quote

# ── 1) pn035 A-4 — rendered-form assertion ──
p = "tests/pn035-relay-async.test.ts"
s = open(p, encoding="utf-8").read()
old = "expect(script).toContain(" + Q + "payload=$(cat " + BS + Q + '"sdir' + BS + Q + '"/*.json 2>/dev/null | jq -sc' + Q + ");"
if old not in s:
    # fallback: the earlier ascii-mangled variant
    old2 = 'expect(script).toContain(' + Q + 'payload=$(cat "$sdir"/*.json 2>/dev/null | jq -sc' + Q + ');'
    assert old2 in s, "A-4 anchor not found"
    old = old2
new = (
    "expect(script).toContain(" + Q + "payload=$(printf " + Q + "%s" + BS + "n" + Q + " " + BS + Q + '"files' + BS + Q + " | xargs cat 2>/dev/null | jq -sc" + Q + ");\n"
    "    expect(script).toContain(" + Q + "| xargs rm -f 2>/dev/null" + Q + "); // عکسبندی فهرست — حذف دقیقاً همان فایل‌های پست‌شده"
)
s = s.replace(old, new, 1)
open(p, "w", encoding="utf-8").write(s)
print("A-4 updated")

# ── 2) audit-relay-matrix — source-escaped form ──
p2 = "scripts/audit-relay-matrix.sh"
s2 = open(p2, encoding="utf-8").read()
# current pin (source-escaped): payload=\$(cat "\$sdir"/*.json ... — with \$ and \"
old2 = "payload=" + BS + "$(cat " + BS + BS + Q + BS + '$sdir' + BS + BS + Q + "/*.json 2>/dev/null | jq -sc"
assert old2 in s2, "matrix anchor not found: " + repr(old2)
new2 = "payload=" + BS + "$(printf " + Q + "%s" + BS + BS + "n" + Q + " " + BS + BS + Q + BS + "$files" + BS + BS + Q + " | xargs cat 2>/dev/null | jq -sc"
s2 = s2.replace(old2, new2, 1)
open(p2, "w", encoding="utf-8").write(s2)
print("matrix pin updated")
