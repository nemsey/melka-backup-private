#!/usr/bin/env python3
"""DIR-RELAY-UNLIMITED-001 — update test files to نسل N contract (bidi-safe)."""

def edit(path, pairs):
    s = open(path, encoding="utf-8").read()
    for old, new in pairs:
        if old not in s:
            raise SystemExit(f"ANCHOR MISSING in {path}:\n---\n{old[:200]}\n---")
        s = s.replace(old, new, 1)
    open(path, "w", encoding="utf-8").write(s)
    print(f"OK {path}: {len(pairs)} edits")

# ─────────────────────────────────────────────────────────────
# 1) tests/pn035-relay-async.test.ts
# ─────────────────────────────────────────────────────────────
P1 = "tests/pn035-relay-async.test.ts"
pairs1 = [
    # A-2
    (r'''expect(script).toContain('BODY="{\\"wait\\":100,\\"batch\\":$BATCH}"');''', r'''expect(script).toContain('BODY="{\\"wait\\":$POLL_WAIT_S,\\"batch\\":$BATCH}"');'''),
    ('expect(script).toContain("BATCH=24");', 'expect(script).toContain("BATCH=48");\n    expect(script).toContain("POLL_WAIT_S=50");'),
    # A-4
    (r'''expect(script).toContain('post_results "$RESULT_JSON"');''', r'''expect(script).toContain('post_results "$payload"');'''),
    (r'''expect(script).toContain('RESULT_JSON=$(cat "$RESULTS_DIR"/*.json 2>/dev/null | jq -sc');''', r'''expect(script).toContain('payload=$(cat "$sdir"/*.json 2>/dev/null | jq -sc');'''),
    # A-7
    ('expect(script).toContain("MAX_WORKERS=12");', 'expect(script).toContain("MAX_WORKERS=16");\n    expect(script).toContain("EXPRESS_SLOTS=8");\n    expect(script).toContain(\'active_jobs() { jobs -pr | wc -l; }\');\n    expect(script).toContain(\'process_item_spool "$ITEM" "$SPOOL_DIR" &\');'),
    ('expect(script).toContain("if [ $(( IDX % MAX_WORKERS )) -eq 0 ]; then");\n    expect(script).toContain(\'process_item "$ITEM"\');\n  });', 'expect(script).toContain(\'process_item "$item" "$outf"\');\n  });'),
    # A-10 markers
    ('expect(script).toContain("نسل M · PN-068");', 'expect(script).toContain("نسل N · DIR-RELAY-UNLIMITED-001");'),
    ('expect(script).toContain("تیم حداکثری ۱۲ کارگر");', 'expect(script).toContain("استخر $MAX_WORKERS+$EXPRESS_SLOTS کارگر");'),
    ('expect(script).toContain("نسل L: Long-Polling ۱۰۰ث");\n    ', ""),
    ('expect(script).toContain("نسل M: دسته batch=$BATCH · موج‌های $MAX_WORKERS کارگر · Express lane (OTP مقدم) · مهلت OTP=$LIGHT_TIMEOUTث / سنگین=$HEAVY_TIMEOUTث · تلاش دوم تایم‌اوت · رفع jq ARG_MAX (--rawfile + stdin)");',
     'expect(script).toContain("نسل N: batch=$BATCH · استخر $MAX_WORKERS+$EXPRESS_SLOTS کارگر · نتیجهٔ جریانی (موج‌به‌موج) · poll میان‌موجی هر $EXPRESS_POLL_Sث · مهلت OTP=$LIGHT_TIMEOUTث / فهرست=$LIST_TIMEOUTث / سنگین=$HEAVY_TIMEOUTث · رفع jq ARG_MAX (--rawfile + stdin)");'),
    ('expect(script).toContain("MELKA_CURL_TIMEOUT=110 signed_curl");', 'expect(script).toContain("MELKA_CURL_TIMEOUT=$(( POLL_WAIT_S + 15 )) signed_curl");'),
    # K-2: add LIST_TIMEOUT
    ('expect(script).toContain("LIGHT_TIMEOUT=15");', 'expect(script).toContain("LIGHT_TIMEOUT=15");\n    expect(script).toContain("LIST_TIMEOUT=25");'),
    ('expect(script).toContain("is_interactive");\n    expect(script).toContain(\'local MAX_TIME="$LIGHT_TIMEOUT"\');',
     'expect(script).toContain("is_interactive");\n    expect(script).toContain("is_list");\n    expect(script).toContain(\'local MAX_TIME="$LIGHT_TIMEOUT"\');\n    expect(script).toContain(\'local MAX_TIME="$LIST_TIMEOUT"\');'),
    # K-4: express lane — new mechanics
    ("'run_batch_set \"$EXPRESS_JSON\" \"express\"'", "'process_set \"$ITEMS_JSON\"'"),
    ("'run_batch_set \"$NORMAL_JSON\" \"normal\"'", "'process_set()\")"),
    ('expect(script).toContain(\'log "Express lane: $EXPRESS_N آیتم تعاملی (OTP/ثبت آگهی) — پیش از فهرست‌ها اجرا می‌شود"\');',
     'expect(script).toContain("Express lane (PN-036 فاز ۵ + PN-080)");\n    expect(script).toContain("express_poll_items");'),
    # K-6: run_batch_set -> process_set + drain
    ('expect(script).toContain("run_batch_set()");', 'expect(script).toContain("process_set()");'),
    ("'دسته $label: $TOTALN نتیجه'", '"جریان نتیجه:")'),
    # B-1: body contract + streaming results (raw strings — file has literal \\ sequences)
    (r'''    expect(polls.length).toBeGreaterThanOrEqual(1);
    expect(Buffer.from(polls[0].body_b64, "base64").toString("utf8")).toBe('{"wait":100,"batch":24}');''',
     r'''    expect(polls.length).toBeGreaterThanOrEqual(1);
    expect(Buffer.from(polls[0].body_b64, "base64").toString("utf8")).toBe('{"wait":50,"batch":48}');'''),
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
      .update(`POST\\n/api/mobile-relay/result\\n${digest}\\n${ts}`)
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
          .update(`POST\\n/api/mobile-relay/result\\n${digest}\\n${ts}`)
          .digest("hex");
        expect(res.headers["x-melka-signature"]).toBe(expectSig);
        expect(res.headers["x-melka-relay-device"]).toBe(DEVICE_ID);
      }
    }'''),
]
edit(P1, pairs1)

# ─────────────────────────────────────────────────────────────
# 2) tests/pn031i-relay-hardening.test.ts
# ─────────────────────────────────────────────────────────────
P2 = "tests/pn031i-relay-hardening.test.ts"
pairs2 = [
    ('expect(script).toContain("-ge 5 ]");', 'expect(script).toContain(\'-ge "$RATE_MAX" ]\');\n    expect(script).toContain("RATE_MAX=20");'),
]
edit(P2, pairs2)

# ─────────────────────────────────────────────────────────────
# 3) scripts/pn031i/bash-smoke.sh — rate gate harness (cap 20)
# ─────────────────────────────────────────────────────────────
P3 = "scripts/pn031i/bash-smoke.sh"
pairs3 = [
    ("""# ── ۱) rate_gate: پنجرهٔ ۶۰ثانیه‌ای حداکثر ۵ ──
SERVER_URL="https://x.example"; DEVICE_ID="d"; DEVICE_SECRET="s"; ALT_SERVER_URL=""
. /tmp/pn031i-errdesc.fn 2>/dev/null || true
log() { :; }
REQ_TIMES=()
now() { date +%s; }
# شبیه‌سازی: ۵ مهر در همین لحظه → درخواست ششم باید مکث بگیرد
T=$(now); REQ_TIMES=("$T" "$T" "$T" "$T" "$T")""",
     """# ── ۱) rate_gate: پنجرهٔ ۶۰ثانیه‌ای حداکثر $RATE_MAX (نسل N: ۲۰) ──
SERVER_URL="https://x.example"; DEVICE_ID="d"; DEVICE_SECRET="s"; ALT_SERVER_URL=""
. /tmp/pn031i-errdesc.fn 2>/dev/null || true
log() { :; }
REQ_TIMES=()
RATE_MAX=20
now() { date +%s; }
# شبیه‌سازی: ۲۰ مهر در همین لحظه → درخواست بعدی باید مکث بگیرد
T=$(now); REQ_TIMES=("$T" "$T" "$T" "$T" "$T" "$T" "$T" "$T" "$T" "$T" "$T" "$T" "$T" "$T" "$T" "$T" "$T" "$T" "$T" "$T")"""),
    ('ck "rate_gate مکث گرفت (۵تماس/۶۰ث)" "$SLEPT" "1"', 'ck "rate_gate مکث گرفت (۲۰تماس/۶۰ث · نسل N)" "$SLEPT" "1"'),
]
edit(P3, pairs3)

# ─────────────────────────────────────────────────────────────
# 4) tests/pn031c-forgiving-code.test.ts — F-3 route contract
# ─────────────────────────────────────────────────────────────
P4 = "tests/pn031c-forgiving-code.test.ts"
pairs4 = [
    ('expect(src).toContain("maxAttempts: 3");', 'expect(src).toContain("maxAttempts: dev.maxAttempts");'),
]
edit(P4, pairs4)

# ─────────────────────────────────────────────────────────────
# 5) scripts/audit-mobile-relay.sh — rate cap 5 -> RATE_MAX
# ─────────────────────────────────────────────────────────────
P5 = "scripts/audit-mobile-relay.sh"
pairs5 = [
    ("rg -q '\\-ge 5 \\]' src/lib/melk-api/relay-script.ts && ok \"قانون I: سقف نرخ ۵/دقیقه\" || fail \"سقف نرخ غایب\"",
     "rg -q 'RATE_MAX=20' src/lib/melk-api/relay-script.ts && rg -q '\\-ge \"\\$RATE_MAX\" \\]' src/lib/melk-api/relay-script.ts && ok \"قانون I: سقف نرخ ۲۰/دقیقه (نسل N)\" || fail \"سقف نرخ غایب\""),
]
edit(P5, pairs5)

# ─────────────────────────────────────────────────────────────
# 6) scripts/audit-relay-matrix.sh — stale pins -> نسل N
# ─────────────────────────────────────────────────────────────
P6 = "scripts/audit-relay-matrix.sh"
s6 = open(P6, encoding="utf-8").read()
s6 = s6.replace('grep -Fq \'BODY="{\\"wait\\":100,\\"batch\\":$BATCH}"\' "$RELAY_SCRIPT"', 'grep -Fq \'BODY="{\\"wait\\":$POLL_WAIT_S,\\"batch\\":$BATCH}"\' "$RELAY_SCRIPT"')
s6 = s6.replace('grep -q "MAX_WORKERS=8" "$RELAY_SCRIPT"', 'grep -q "MAX_WORKERS=16" "$RELAY_SCRIPT"')
s6 = s6.replace('grep -q "BATCH=20" "$RELAY_SCRIPT"', 'grep -q "BATCH=48" "$RELAY_SCRIPT"')
open(P6, "w", encoding="utf-8").write(s6)
print(f"OK {P6}: pins refreshed")
