#!/usr/bin/env python3
"""DIR-RELAY-UNLIMITED-001 — remaining test/audit edits (after partial MultiEdit)."""

def edit(path, pairs):
    s = open(path, encoding="utf-8").read()
    for old, new in pairs:
        if old not in s:
            raise SystemExit(f"ANCHOR MISSING in {path}:\n---\n{old[:200]}\n---")
        s = s.replace(old, new, 1)
    open(path, "w", encoding="utf-8").write(s)
    print(f"OK {path}: {len(pairs)} edits")

# ── 1) pn035: K-6 + B-1 ──
P1 = "tests/pn035-relay-async.test.ts"
pairs1 = [
    # K-6
    (r'''expect(script).toContain("run_batch_set()");''', r'''expect(script).toContain("process_set()");'''),
    (r"""'دسته $label: $TOTALN نتیجه'""", r'''"جریان نتیجه:")'''),
    # B-1: wait/batch body
    (r"""    expect(Buffer.from(polls[0].body_b64, "base64").toString("utf8")).toBe('{"wait":100,"batch":24}');""",
     r"""    expect(Buffer.from(polls[0].body_b64, "base64").toString("utf8")).toBe('{"wait":50,"batch":48}');"""),
    # B-1: streaming results block (file has single-backslash \n in template literal)
    (r'''    // کل دسته در یک POST واحد
    expect(results.length).toBe(1);
    const res = results[0];
    expect(res.path).toBe("/api/mobile-relay/result");

    // مسیر gzip فعال بود (بدنه > ۱KB)
    expect(res.headers["content-encoding"]).toBe("gzip");

    // امضای گوشی روی «همان بایت‌های فشردهٔ سیم» — قرارداد فاز ۶
    const wire = Buffer.from(res.body_b64, "base64");
    const digest = createHash("sha256").update(wire).digest("hex");
    const ts = res.headers["x-melka-timestamp"];
    const expectSig = createHmac("sha256", DEVICE_SECRET)
      .update(`POST\n/api/mobile-relay/result\n${digest}\n${ts}`)
      .digest("hex");
    expect(res.headers["x-melka-signature"]).toBe(expectSig);
    expect(res.headers["x-melka-relay-device"]).toBe(DEVICE_ID);

    // بازکردن gzip → آرایهٔ ۳۰ نتیجه با شناسه‌های صحیح
    const arr = JSON.parse(gunzipSync(wire).toString("utf8")) as Array<{ id: string; error?: string }>;
    expect(arr.length).toBe(30);
    expect(arr[0].id).toBe("jobitem-001");
    expect(arr[29].id).toBe("jobitem-030");
    // آیتم‌ها DNS-NXDOMAIN دارند → خطای curl ۶ (whitelist عبور کرد، تماس واقعی نه)
    expect(arr.every((r) => typeof r.error === "string" && r.error.includes("curl exit"))).toBe(true);''',
     r'''    // نسل N: نتیجه‌های جریانی — یک یا چند POST؛ مجموع اقلام باید کامل برسد
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].path).toBe("/api/mobile-relay/result");

    const decode = (r: (typeof results)[number]): Array<{ id: string; error?: string }> => {
      const w = Buffer.from(r.body_b64, "base64");
      const text = r.headers["content-encoding"] === "gzip" ? gunzipSync(w).toString("utf8") : w.toString("utf8");
      return JSON.parse(text) as Array<{ id: string; error?: string }>;
    };
    const all = results.flatMap(decode);
    expect(all.length).toBe(30);
    expect(new Set(all.map((r) => r.id)).size).toBe(30);
    expect(all.every((r) => typeof r.error === "string" && r.error.includes("curl exit"))).toBe(true);

    // مسیر gzip فعال بود برای پست‌های بزرگ (بدنهٔ سیم > ۱KB)
    for (const res of results) {
      if (Buffer.from(res.body_b64, "base64").length > 1024) {
        expect(res.headers["content-encoding"]).toBe("gzip");
        // امضای گوشی روی «همان بایت‌های فشردهٔ سیم» — قرارداد فاز ۶
        const wire = Buffer.from(res.body_b64, "base64");
        const digest = createHash("sha256").update(wire).digest("hex");
        const ts = res.headers["x-melka-timestamp"];
        const expectSig = createHmac("sha256", DEVICE_SECRET)
          .update(`POST\n/api/mobile-relay/result\n${digest}\n${ts}`)
          .digest("hex");
        expect(res.headers["x-melka-signature"]).toBe(expectSig);
        expect(res.headers["x-melka-relay-device"]).toBe(DEVICE_ID);
      }
    }'''),
]
edit(P1, pairs1)

# ── 2) pn031i: rate cap pin ──
edit("tests/pn031i-relay-hardening.test.ts", [
    ('expect(script).toContain("-ge 5 ]");', 'expect(script).toContain(\'-ge "$RATE_MAX" ]\');\n    expect(script).toContain("RATE_MAX=20");'),
])

# ── 3) bash-smoke.sh: harness 20 stamps ──
edit("scripts/pn031i/bash-smoke.sh", [
    (r'''T=$(now); REQ_TIMES=("$T" "$T" "$T" "$T" "$T")''',
     r'''RATE_MAX=20
T=$(now); REQ_TIMES=("$T" "$T" "$T" "$T" "$T" "$T" "$T" "$T" "$T" "$T" "$T" "$T" "$T" "$T" "$T" "$T" "$T" "$T" "$T" "$T")'''),
    ('ck "rate_gate مکث گرفت (۵تماس/۶۰ث)" "$SLEPT" "1"', 'ck "rate_gate مکث گرفت (۲۰تماس/۶۰ث · نسل N)" "$SLEPT" "1"'),
])

# ── 4) pn031c: F-3 route contract ──
edit("tests/pn031c-forgiving-code.test.ts", [
    ('expect(src).toContain("maxAttempts: 3");', 'expect(src).toContain("maxAttempts: dev.maxAttempts");'),
])

# ── 5) audit-mobile-relay.sh ──
edit("scripts/audit-mobile-relay.sh", [
    (r"""rg -q '\-ge 5 \]' src/lib/melk-api/relay-script.ts && ok "قانون I: سقف نرخ ۵/دقیقه" || fail "سقف نرخ غایب\"""",
     r"""rg -q 'RATE_MAX=20' src/lib/melk-api/relay-script.ts && rg -q '\-ge "\$RATE_MAX" \]' src/lib/melk-api/relay-script.ts && ok "قانون I: سقف نرخ ۲۰/دقیقه (نسل N)" || fail "سقف نرخ غایب\""""),
])

# ── 6) audit-relay-matrix.sh: refresh stale pins ──
P6 = "scripts/audit-relay-matrix.sh"
s6 = open(P6, encoding="utf-8").read()
a = 'grep -Fq \'BODY="{\\"wait\\":100,\\"batch\\":$BATCH}"\' "$RELAY_SCRIPT"'
b = 'grep -Fq \'BODY="{\\"wait\\":$POLL_WAIT_S,\\"batch\\":$BATCH}"\' "$RELAY_SCRIPT"'
assert a in s6, "relay-matrix BODY pin missing"
s6 = s6.replace(a, b)
a = 'grep -q "MAX_WORKERS=8" "$RELAY_SCRIPT"'
b = 'grep -q "MAX_WORKERS=16" "$RELAY_SCRIPT"'
assert a in s6, "relay-matrix MAX_WORKERS pin missing"
s6 = s6.replace(a, b)
a = 'grep -q "BATCH=20" "$RELAY_SCRIPT"'
b = 'grep -q "BATCH=48" "$RELAY_SCRIPT"'
assert a in s6, "relay-matrix BATCH pin missing"
s6 = s6.replace(a, b)
open(P6, "w", encoding="utf-8").write(s6)
print(f"OK {P6}: pins refreshed")
