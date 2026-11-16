#!/usr/bin/env python3
"""DIR-RELAY-UNLIMITED-001 — round-2 test fixes (pn031c F-3, pn041r B-3/D/G, pn031i الف-۴)."""

def edit(path, pairs):
    s = open(path, encoding="utf-8").read()
    for old, new in pairs:
        if old not in s:
            raise SystemExit(f"ANCHOR MISSING in {path}:\n---\n{old[:160]}\n---")
        s = s.replace(old, new, 1)
    open(path, "w", encoding="utf-8").write(s)
    print(f"OK {path}: {len(pairs)} edits")

# 1) pn031c F-3 — note text
edit("tests/pn031c-forgiving-code.test.ts", [
    ('expect(src).toContain("کد تا ۳ بار قابل استفاده است");',
     'expect(src).toContain("کد تا ۳۰ روز و ۹۹ بار دانلود قابل استفاده است");'),
])

# 2) pn041r — B-3 interval, D-1/D-2/D-3/D-5 script contract, G-4 UI badges
edit("tests/pn041r-auth-resilience.test.ts", [
    # B-3
    ('expect(src).toContain("POLL_INTERVAL_SLOW_MS = 3_000");',
     'expect(src).toContain("POLL_INTERVAL_SLOW_MS = 2_000"); // نسل N: ۳ث ← ۲ث'),
    # D-1
    ('expect(src).toContain("نسل L = PN-041-R");',
     'expect(src).toContain("نسل N = DIR-RELAY-UNLIMITED-001");'),
    # D-2
    (r'''expect(src).toContain('BODY="{\\"wait\\":100,\\"batch\\":$BATCH}"');''',
     r'''expect(src).toContain('BODY="{\\"wait\\":$POLL_WAIT_S,\\"batch\\":$BATCH}"');'''),
    # D-3
    ('expect(src).toContain("MELKA_CURL_TIMEOUT=110 signed_curl");',
     'expect(src).toContain("MELKA_CURL_TIMEOUT=$(( POLL_WAIT_S + 15 )) signed_curl");'),
    # D-5 needle
    (r'''expect(script).toContain('\\"wait\\":100');''',
     r'''expect(script).toContain('\\"wait\\":$POLL_WAIT_S');'''),
    # G-4 badges
    (r'''expect(src).toContain("Poll طولانی: ۱۰۰ ثانیه");
    expect(src).toContain("سبک (ورود): ۲۰ث");
    expect(src).toContain("سنگین (فهرست‌ها): ۱۵۰ث");''',
     r'''expect(src).toContain("Poll طولانی: ۵۰ ثانیه");
    expect(src).toContain("دسته: ۴۸ آیتم · استخر ۱۶+۸ کارگر موازی");
    expect(src).toContain("بدون محدودیت حجم/تعداد (تا ۱۶MB هر نتیجه)");'''),
])

# 3) pn031i الف-۴ — log message uses $RATE_MAX now
edit("tests/pn031i-relay-hardening.test.ts", [
    ('expect(script).toContain("سقف نرخ (۵ در دقیقه)");',
     'expect(script).toContain(\'سقف نرخ ($RATE_MAX در دقیقه)\');'),
])
