#!/usr/bin/env python3
"""Clean rewrite of A-4 assertion + matrix pin (quote-safe)."""

# ── 1) pn035 A-4 ──
p = "tests/pn035-relay-async.test.ts"
s = open(p, encoding="utf-8").read()
start = s.find("    expect(script).toContain(")
# find the broken A-4 line block: from first toContain with payload=$(printf to the xargs rm -f line end
i = s.find("payload=$(printf")
assert i > 0
# find start of this statement line
line_start = s.rfind("\n", 0, i) + 1
# find end of the NEXT line (xargs rm -f assertion)
j = s.find("| xargs rm -f", i)
assert j > 0
line_end = s.find("\n", j) + 1
old_block = s[line_start:line_end]
new_block = (
    '    expect(script).toContain("payload=$(printf \'%s\\\\n\' \\"$files\\" | xargs cat 2>/dev/null | jq -sc");\n'
    "    expect(script).toContain('| xargs rm -f 2>/dev/null'); // عکسبندی فهرست — حذف دقیقاً همان فایل‌های پست‌شده\n"
)
s = s.replace(old_block, new_block, 1)
open(p, "w", encoding="utf-8").write(s)
print("A-4 rewritten")
print("NEW BLOCK:", new_block.strip()[:120])

# ── 2) matrix pin ──
p2 = "scripts/audit-relay-matrix.sh"
s2 = open(p2, encoding="utf-8").read()
i2 = s2.find("payload=")
line_start2 = s2.rfind("\n", 0, i2) + 1
line_end2 = s2.find("\n", i2) + 1
old_line = s2[line_start2:line_end2]
new_line = (
    'grep -q \'xargs cat 2>/dev/null | jq -sc\' "$RELAY_SCRIPT" && grep -q \'xargs rm -f 2>/dev/null\' "$RELAY_SCRIPT"; check "relay-script: ادغام stdin انبار نتیجه (نسل N)" $?\n'
)
s2 = s2.replace(old_line, new_line, 1)
open(p2, "w", encoding="utf-8").write(s2)
print("matrix pin rewritten")
