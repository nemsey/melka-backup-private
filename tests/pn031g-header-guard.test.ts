/**
 * تست‌های PN-031-G (شورا-ن۰۴۷) — گارد هدرهای احراز + پایان «missing auth headers»
 * ---------------------------------------------------------------------------
 * زمینه: مالک با اسکریپت تحویلی ناشناس (جلسهٔ ازدست‌رفته) Poll می‌فرستاد؛ سرور
 * «missing auth headers» می‌داد در حالی که X-Melka-Relay-Device می‌رسید — یعنی
 * Timestamp/Signature خالی/غایب بودند (curl هدرِ مقدارِ خالی را بی‌صدا حذف می‌کند).
 *
 *   A) سخت‌سازی اسکریپت — پیش‌پرواز امضا · وارسی پیکربندی · پیام موفقیت صادقانه
 *   B) اجرای واقعی bash — signed_curl از خودِ اسکریپت تولیدشده در برابر سرور
 *      آزمایشی محلی: سه هدر با مقدارِ پُر می‌رسند و امضای bash دقیقاً برابر
 *      امضای موردانتظار سرور (node:crypto) است — تستی که باگ مالک را می‌گرفت.
 *   C) سرور — پاسخ رد، نام هدرهای غایب (missing) را می‌گوید
 *   D) پابرجایی قرارداد — همان سه هدرِ قراردادی، نه نام‌های دیگر
 *
 * اجرا: bun test tests/pn031g-header-guard.test.ts
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createHash, createHmac } from "node:crypto";
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { buildRelayScript } from "../src/lib/melk-api/relay-script";
import { verifyRelayRequestAuth } from "../src/lib/melk-api/relay";

const REPO = join(import.meta.dir, "..");
const POLL_ROUTE = join(REPO, "src/app/api/mobile-relay/poll/route.ts");
const RESULT_ROUTE = join(REPO, "src/app/api/mobile-relay/result/route.ts");
const RELAY_LIB = join(REPO, "src/lib/melk-api/relay.ts");

const DEVICE_ID = "pn031g-guard-01";
const DEVICE_SECRET = "b".repeat(64);

const script = buildRelayScript({
  serverUrl: "http://127.0.0.1:1", // در بخش B با پورت واقعی mock بازتولید می‌شود
  deviceId: DEVICE_ID,
  deviceSecret: DEVICE_SECRET,
});

// ───────────────────── A) سخت‌سازی اسکریپت (۶) ─────────────────────

describe("PN-031-G · A) پیش‌پرواز امضا — پایان حذفِ خاموشِ هدر", () => {
  test("A-1: پیش‌پرواز در signed_curl — ts/sig خالی هرگز ارسال نمی‌شود", () => {
    // curl هدر با مقدار خالی را بی‌صدا حذف می‌کند → «missing auth headers» بی‌ردپا.
    // این گارد همان کلاس خطای مالک (جلسهٔ ۰۴۷) را ناممکن می‌کند.
    expect(script).toContain('if [ -z "$ts" ] || [ -z "$sig" ]; then');
    expect(script).toContain("خطای داخلی: امضا/زمان خالی ساخته شد");
    expect(script).toContain("return 9");
  });

  test("A-2: وارسی پیکربندی در آغاز — سه مقدار تزریقی نان‌خالی", () => {
    expect(script).toContain('if [ -z "$SERVER_URL" ] || [ -z "$DEVICE_ID" ] || [ -z "$DEVICE_SECRET" ]; then');
    expect(script).toContain("پیکربندی ناقص");
  });

  test("A-3: پیام موفقیت صادقانه — «رله فعال» فقط پس از اولین پاسخ سرور", () => {
    // پیش از این، پیام فعال بودن پیش از هر اتصال چاپ می‌شد و مالک را گمراه می‌کرد
    expect(script).toContain("رلهٔ ملکا آغاز شد — دستگاه: $DEVICE_ID (در حال اتصال…)");
    expect(script).toContain('log "✓ اتصال تأیید شد — رلهٔ ملکا فعال است"');
    // و این پیام داخل حلقه است (پس از poll)، نه در آغاز اسکریپت
    const loopStart = script.indexOf("while true; do");
    const successMsg = script.indexOf("✓ اتصال تأیید شد");
    expect(successMsg).toBeGreaterThan(loopStart);
    expect(loopStart).toBeGreaterThan(0);
  });

  test("A-4: نام هدرهای احرازی غایب از پاسخ ۴۰۳ روی گوشی نمایش داده می‌شود", () => {
    expect(script).toContain(".missing // []");
    expect(script).toContain("هدرهای نایافته: $MISSING");
  });

  test("A-5: نام هدرهای احراز در آغاز لاگ می‌شود (فقط نام — بدون مقدار)", () => {
    expect(script).toContain("log \"احراز: X-Melka-Relay-Device + X-Melka-Timestamp + X-Melka-Signature\"");
  });

  test("A-6: دستور curl دست‌نخورده — URL و سه -H (رگرسیون G-1/E-2)", () => {
    expect(script).toContain('curl -sS --max-time 35 "$SERVER_URL$path" "$@"');
    expect(script).toContain("X-Melka-Relay-Device: $DEVICE_ID");
    expect(script).toContain("X-Melka-Timestamp: $ts");
    expect(script).toContain("X-Melka-Signature: $sig");
  });
});

// ───────────────────── B) اجرای واقعی bash (5) ─────────────────────

describe("PN-031-G · B) اجرای واقعی signed_curl در برابر سرور آزمایشی", () => {
  const TMP = "/tmp/pn031g-test";
  const RECORDS = `${TMP}/records.jsonl`;
  const HELPER = join(REPO, "scripts/pn031g/run-signed-curl.sh");
  const MOCK = join(REPO, "scripts/pn031g/mock-headers.py");
  let mockProc: ReturnType<typeof Bun.spawn> | null = null;
  let port = 0;
  let records: { method: string; path: string; headers: Record<string, string>; body: string }[] = [];

  beforeAll(async () => {
    writeFileSync(RECORDS, "");
    mockProc = Bun.spawn(["python3", MOCK, "0", RECORDS], { stdout: "pipe", stderr: "ignore" });
    // فقط خط اول (شمارهٔ پورت) خوانده می‌شود — استریم سرور زنده است و بسته نمی‌شود
    const reader = (mockProc.stdout as ReadableStream<Uint8Array>).getReader();
    const dec = new TextDecoder();
    let line = "";
    while (!line.includes("\n")) {
      const { value, done } = await reader.read();
      if (done) break;
      line += dec.decode(value);
    }
    reader.releaseLock();
    port = Number(line.trim().split("\n")[0]);
    expect(port).toBeGreaterThan(0);
    // اسکریپت واقعی با نشانی mock بازتولید — همان چیزی که bootstrap می‌دهد
    const mockScript = buildRelayScript({
      serverUrl: `http://127.0.0.1:${port}`,
      deviceId: DEVICE_ID,
      deviceSecret: DEVICE_SECRET,
    });
    writeFileSync(`${TMP}/relay.sh`, mockScript);
  });

  afterAll(() => {
    mockProc?.kill();
    for (const f of [RECORDS, `${TMP}/relay.sh`, `${TMP}/sabotage.sh`]) {
      if (existsSync(f)) unlinkSync(f);
    }
  });

  const readRecords = () => {
    if (!existsSync(RECORDS)) return [];
    const txt = readFileSync(RECORDS, "utf8").trim();
    if (!txt) return [];
    return txt.split("\n").map((l) => JSON.parse(l) as typeof records[number]);
  };

  test("B-1: اسکریپت تولیدشده bash -n معتبر است", () => {
    const r = Bun.spawnSync(["bash", "-n", `${TMP}/relay.sh`]);
    expect(r.exitCode).toBe(0);
  });

  test("B-2: اجرای واقعی — هر سه هدر احراز با مقدارِ پُر به سرور می‌رسند", () => {
    const r = Bun.spawnSync(["bash", HELPER, `${TMP}/relay.sh`, "ok"]);
    expect(r.exitCode).toBe(0);
    const out = r.stdout.toString();
    expect(out).toContain("CURL_EXIT=0");
    records = readRecords();
    expect(records.length).toBeGreaterThanOrEqual(1);
    const req = records[records.length - 1]!;
    expect(req.method).toBe("POST");
    expect(req.path).toBe("/api/mobile-relay/poll");
    expect(req.headers["x-melka-relay-device"]).toBe(DEVICE_ID);
    expect((req.headers["x-melka-timestamp"] ?? "").length).toBeGreaterThan(0);
    expect((req.headers["x-melka-signature"] ?? "")).toMatch(/^[0-9a-f]{64}$/);
  });

  test("B-3: امضای bash دقیقاً امضای موردانتظار سرور است (node:crypto · قرارداد کامل)", () => {
    const req = records[records.length - 1]!;
    const ts = req.headers["x-melka-timestamp"]!;
    const sig = req.headers["x-melka-signature"]!;
    const digest = createHash("sha256").update(req.body, "utf8").digest("hex");
    const msg = `POST\n/api/mobile-relay/poll\n${digest}\n${ts}`;
    const expected = createHmac("sha256", DEVICE_SECRET).update(msg, "utf8").digest("hex");
    expect(sig).toBe(expected);
    // ts میلی‌ثانیهٔ معتبر در پنجرهٔ ±۵ دقیقه
    expect(Math.abs(Date.now() - Number(ts))).toBeLessThan(5 * 60 * 1000);
  });

  test("B-4: خرابکاری hmac خالی → پیش‌پرواز می‌گیرد و هیچ درخواستی ارسال نمی‌شود", () => {
    writeFileSync(RECORDS, ""); // صفر کردن شمارندهٔ سرور
    const r = Bun.spawnSync(["bash", HELPER, `${TMP}/relay.sh`, "sabotage"]);
    expect(r.exitCode).toBe(0);
    const out = (r.stdout.toString() + r.stderr.toString());
    expect(out).toContain("CURL_EXIT=9");
    expect(out).toContain("خطای داخلی: امضا/زمان خالی ساخته شد");
    // سرور آزمایشی هیچ درخواستی ندید — هدرِ خالی هرگز به سیم نرسید
    expect(readRecords().length).toBe(0);
  });

  test("B-5: مستندسازی مکانیزم باگ مالک — curl هدرِ مقدارِ خالی را بی‌صدا حذف می‌کند", () => {
    writeFileSync(RECORDS, "");
    // عین الگوی گوشی مالک: هدر دستگاه پر، دو هدر دیگر «مقدار خالی»
    const r = Bun.spawnSync([
      "bash", "-c",
      `curl -sS -o /dev/null -X POST "http://127.0.0.1:${port}/api/mobile-relay/poll" ` +
        `-H "Content-Type: application/json" ` +
        `-H "X-Melka-Relay-Device: ${DEVICE_ID}" ` +
        `-H "X-Melka-Timestamp: " ` +
        `-H "X-Melka-Signature: " ` +
        `--data-binary '{"wait":0}'`,
    ]);
    expect(r.exitCode).toBe(0);
    const reqs = readRecords();
    expect(reqs.length).toBe(1);
    const h = reqs[0]!.headers;
    expect(h["x-melka-relay-device"]).toBe(DEVICE_ID); // این یکی رسید…
    expect(h["x-melka-timestamp"]).toBeUndefined(); // …و این دو بی‌صدا حذف شدند
    expect(h["x-melka-signature"]).toBeUndefined(); // ← ریشهٔ «missing auth headers» مالک
  });
});

// ───────────────────── C) سرور — تشخیص نام هدرهای غایب (4) ─────────────────────

describe("PN-031-G · C) سرور: پاسخ رد می‌گوید کدام هدر نرسیده است", () => {
  test("C-1: فقط هدر دستگاه حاضر → missing = [Timestamp, Signature]", async () => {
    const h = new Headers({ "X-Melka-Relay-Device": "pn031g-x" });
    const r = await verifyRelayRequestAuth("POST", "/api/mobile-relay/poll", "{}", h);
    expect(r.ok).toBe(false);
    expect(r.status).toBe(403);
    expect(r.error).toBe("missing auth headers");
    expect(r.missing).toEqual(["X-Melka-Timestamp", "X-Melka-Signature"]);
  });

  test("C-2: هیچ هدری نیست → missing = هر سه نام به ترتیب قرارداد", async () => {
    const r = await verifyRelayRequestAuth("POST", "/api/mobile-relay/poll", "{}", new Headers());
    expect(r.missing).toEqual(["X-Melka-Relay-Device", "X-Melka-Timestamp", "X-Melka-Signature"]);
  });

  test("C-3: روت‌های poll و result فیلد missing را به گوشی می‌رسانند", () => {
    const poll = readFileSync(POLL_ROUTE, "utf8");
    const result = readFileSync(RESULT_ROUTE, "utf8");
    expect(poll).toContain("missing: auth.missing");
    expect(result).toContain("missing: auth.missing");
  });

  test("C-4: ردپای AuditLog نام هدرهای غایب را شامل می‌شود (بدون مقدار)", () => {
    const lib = readFileSync(RELAY_LIB, "utf8");
    expect(lib).toContain("missing auth headers (${missing.join(\", \")})");
    // قانون صفر لاگ محتوا: هیچ مقدار هدر/امضا/رازی در ردپا نیست
    const trace = lib.slice(lib.indexOf("function noteRelayReject"), lib.indexOf("export async function verifyRelayRequestAuth"));
    expect(trace).not.toContain("sig");
    expect(trace).not.toContain("secret");
    expect(trace).not.toContain("rawBody");
  });
});

// ───────────────────── D) پابرجایی قرارداد هدرها (2) ─────────────────────

describe("PN-031-G · D) قرارداد هدرها — سه نامِ قراردادی و فقط همان سه", () => {
  test("D-1: اسکریپت فقط سه هدر قراردادی را می‌فرستد — نه نام‌های متفاوت", () => {
    // نام اشتباهِ «X-Melka-Target» (پیش‌نویس سند ۰۴۷) هرگز در قرارداد نیست —
    // سرور X-Melka-Relay-Device می‌خواهد. این تست از رگرسیون نام هدر می‌گیرد.
    expect(script).not.toContain("X-Melka-Target");
    expect(script).not.toContain("X-Melka-Sig:");
    const headerLines = script.split("\n").filter((l) => l.trim().startsWith("-H \"X-Melka-"));
    expect(headerLines.length).toBe(3);
  });

  test("D-2: پیام امضا همان قرارداد PN-030/031 — POST\\npath\\nsha256(body)\\nts", () => {
    expect(script).toContain("printf 'POST\\n%s\\n%s\\n%s'");
    expect(script).toContain("sha256hex");
    expect(script).toContain("hmac_hex");
  });
});
