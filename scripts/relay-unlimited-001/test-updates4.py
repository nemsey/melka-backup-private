#!/usr/bin/env python3
"""DIR-RELAY-UNLIMITED-001 — round-3: remaining pn041r + pn031i edits."""

def edit(path, pairs):
    s = open(path, encoding="utf-8").read()
    for old, new in pairs:
        if old not in s:
            raise SystemExit(f"ANCHOR MISSING in {path}:\n---\n{old[:160]}\n---")
        s = s.replace(old, new, 1)
    open(path, "w", encoding="utf-8").write(s)
    print(f"OK {path}: {len(pairs)} edits")

BS = chr(92)

# pn041r — D-2 (4 backslashes), D-3, D-5 (2 backslashes), G-4
s = open("tests/pn041r-auth-resilience.test.ts", encoding="utf-8").read()
pairs = [
    # D-2
    ("expect(src).toContain('BODY=\"{" + BS*4 + "\"wait" + BS*4 + "\":100," + BS*4 + "\"batch" + BS*4 + "\":$BATCH}\"');",
     "expect(src).toContain('BODY=\"{" + BS*4 + "\"wait" + BS*4 + "\":$POLL_WAIT_S," + BS*4 + "\"batch" + BS*4 + "\":$BATCH}\"');"),
    # D-3
    ('expect(src).toContain("MELKA_CURL_TIMEOUT=110 signed_curl");',
     'expect(src).toContain("MELKA_CURL_TIMEOUT=$(( POLL_WAIT_S + 15 )) signed_curl");'),
    # D-5
    ("expect(script).toContain('" + BS*2 + "\"wait" + BS*2 + "\":100');",
     "expect(script).toContain('" + BS*2 + "\"wait" + BS*2 + "\":$POLL_WAIT_S');"),
    # G-4 badges
    ('expect(src).toContain("Poll طولانی: ۱۰۰ ثانیه");',
     'expect(src).toContain("Poll طولانی: ۵۰ ثانیه");'),
    ('expect(src).toContain("سبک (ورود): ۲۰ث");',
     'expect(src).toContain("دسته: ۴۸ آیتم · استخر ۱۶+۸ کارگر موازی");'),
    ('expect(src).toContain("سنگین (فهرست‌ها): ۱۵۰ث");',
     'expect(src).toContain("بدون محدودیت حجم/تعداد (تا ۱۶MB هر نتیجه)");'),
]
edit("tests/pn041r-auth-resilience.test.ts", pairs)

# pn031i الف-۴ — log message uses $RATE_MAX now
edit("tests/pn031i-relay-hardening.test.ts", [
    ('expect(script).toContain("سقف نرخ (۵ در دقیقه)");',
     "expect(script).toContain('سقف نرخ ($RATE_MAX در دقیقه)');"),
])
