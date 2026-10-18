/**
 * تست‌های PN-031 — رلهٔ موبایل ایرانی (شورای عالی ملکا · جلسهٔ فوق‌العاده ۰۳۷)
 * ---------------------------------------------------------------------------
 * پوشش تستی سفارش کار PN-031 (فهرست کارها #۵ و #۷):
 *   A) احراز و امنیت HMAC (۶) — قرارداد امضا · پنجرهٔ زمانی · رد دستگاه ناشناس/ابطال‌شده · امضای معتبر
 *   B) چرخهٔ صف (۶) — whitelist · دی‌داپ · claim اتمیک · نتیجه + مالکیت · TTL
 *   C) یکپارچگی proxyFetch/armCall (۴) — مسیر رله · میزبان غیرملک‌تبریزی · حالت خاموش · قفل آفلینی
 *   D) UI/env/اسکریپت (۵) — بخش تنظیمات · env کلیدها · اسکریپت bash معتبر + whitelist + امضای دوجهته + صفر لاگ محتوا
 *   E) سازگاری (۳) — روت‌ها + آینه‌های v1 · رفتار PN-029/030 پابرجا
 *
 * اجرا: bun test tests/pn031-mobile-relay.test.ts
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { readFileSync, existsSync, writeFileSync, unlinkSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const REPO = join(import.meta.dir, "..");

const saved: Record<string, string | undefined> = {};
function setEnv(key: string, value: string | undefined) {
  if (!(key in saved)) saved[key] = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
beforeAll(() => {
  for (const k of ["MELK_ARM_RELAY_MODE", "MELK_ARM_PROXY_URL", "MELK_PROXY_SECRET", "MELK_ARM_OFFLINE"]) setEnv(k, process.env[k]);
});
afterAll(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

/** پاکسازی دادهٔ تست رله پس از هر بخش */
async function cleanupRelayTestData(): Promise<void> {
  const { db } = await import("@/lib/db");
  await db.relayQueue.deleteMany({ where: { claimedBy: { startsWith: "test-" } } });
  await db.relayQueue.deleteMany({ where: { fingerprint: { startsWith: "pn031-test" } } });
  await db.relayDevice.deleteMany({ where: { deviceId: { startsWith: "test-" } } });
}

// ───────────────────── A) احراز و امنیت HMAC (۶) ─────────────────────

describe("PN-031 · A) احراز و امنیت HMAC", () => {
  test("A-1) قرارداد پیام امضا — POST\\npath\\nsha256(body)\\n ts (عین PN-030)", async () => {
    const { relayAuthMessage } = await import("@/lib/melk-api/relay");
    const m = relayAuthMessage("POST", "/api/mobile-relay/poll", '{"wait":20}', "1790000000000");
    expect(m).toBe('POST\n/api/mobile-relay/poll\n' + (await (async () => {
      const { createHash } = await import("node:crypto");
      return createHash("sha256").update('{"wait":20}', "utf8").digest("hex");
    })()) + "\n1790000000000");
  });

  test("A-2) relayHmacHex — هگز ۶۴ · قطعی · حساس به ورودی", async () => {
    const { relayHmacHex } = await import("@/lib/melk-api/relay");
    const a = relayHmacHex("secret", "msg");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(relayHmacHex("secret", "msg")).toBe(a);
    expect(relayHmacHex("secret2", "msg")).not.toBe(a);
  });

  test("A-3) هدرهای غایب → 403 (بدون نشت خطای رمزنگاری)", async () => {
    const { verifyRelayRequestAuth } = await import("@/lib/melk-api/relay");
    const r = await verifyRelayRequestAuth("POST", "/api/mobile-relay/poll", "{}", new Headers());
    expect(r.ok).toBe(false);
    expect(r.status).toBe(403);
    expect(r.error).toBe("missing auth headers");
  });

  test("A-4) مهر زمانی کهنه/آینده → 403 (ضد replay)", async () => {
    const { verifyRelayRequestAuth } = await import("@/lib/melk-api/relay");
    const { db } = await import("@/lib/db");
    const { relayHmacHex, relayAuthMessage } = await import("@/lib/melk-api/relay");
    await db.relayDevice.upsert({
      where: { deviceId: "test-a4" },
      create: { deviceId: "test-a4", secret: "a".repeat(64), label: "تست A-4" },
      update: { secret: "a".repeat(64), revokedAt: null },
    });
    const oldTs = String(Date.now() - 6 * 60 * 1000); // ۶ دقیقه پیش — خارج از پنجرهٔ ±۵
    const body = "{}";
    const sig = relayHmacHex("a".repeat(64), relayAuthMessage("POST", "/api/mobile-relay/poll", body, oldTs));
    const h = new Headers({
      "X-Melka-Relay-Device": "test-a4",
      "X-Melka-Timestamp": oldTs,
      "X-Melka-Signature": sig,
    });
    const r = await verifyRelayRequestAuth("POST", "/api/mobile-relay/poll", body, h);
    expect(r.ok).toBe(false);
    expect(r.error).toBe("stale request");
  });

  test("A-5) امضای معتبر → پذیرش کامل (دستگاه + راز برگردانده می‌شود)", async () => {
    const { verifyRelayRequestAuth, relayHmacHex, relayAuthMessage } = await import("@/lib/melk-api/relay");
    const { db } = await import("@/lib/db");
    await db.relayDevice.upsert({
      where: { deviceId: "test-a5" },
      create: { deviceId: "test-a5", secret: "b".repeat(64), label: "تست A-5" },
      update: { secret: "b".repeat(64), revokedAt: null },
    });
    const ts = String(Date.now());
    const body = '{"wait":20}';
    const sig = relayHmacHex("b".repeat(64), relayAuthMessage("POST", "/api/mobile-relay/poll", body, ts));
    const h = new Headers({
      "X-Melka-Relay-Device": "test-a5",
      "X-Melka-Timestamp": ts,
      "X-Melka-Signature": sig,
    });
    const r = await verifyRelayRequestAuth("POST", "/api/mobile-relay/poll", body, h);
    expect(r.ok).toBe(true);
    expect(r.device?.deviceId).toBe("test-a5");
  });

  test("A-6) امضای غلط و دستگاه ابطال‌شده → 403", async () => {
    const { verifyRelayRequestAuth, relayHmacHex, relayAuthMessage } = await import("@/lib/melk-api/relay");
    const { db } = await import("@/lib/db");
    const ts = String(Date.now());
    const body = "{}";
    // امضای غلط
    const h1 = new Headers({
      "X-Melka-Relay-Device": "test-a5",
      "X-Melka-Timestamp": ts,
      "X-Melka-Signature": "0".repeat(64),
    });
    expect((await verifyRelayRequestAuth("POST", "/x", body, h1)).error).toBe("forbidden");
    // دستگاه ابطال‌شده
    await db.relayDevice.update({ where: { deviceId: "test-a5" }, data: { revokedAt: new Date() } });
    const sig = relayHmacHex("b".repeat(64), relayAuthMessage("POST", "/x", body, ts));
    const h2 = new Headers({
      "X-Melka-Relay-Device": "test-a5",
      "X-Melka-Timestamp": ts,
      "X-Melka-Signature": sig,
    });
    expect((await verifyRelayRequestAuth("POST", "/x", body, h2)).error).toBe("device revoked");
    await cleanupRelayTestData();
  });
});

// ───────────────────── B) چرخهٔ صف (۶) ─────────────────────

describe("PN-031 · B) چرخهٔ صف RelayQueue", () => {
  test("B-1) whitelist — enqueue میزبان غیرملک‌تبریزی رد می‌شود (دفاع در عمق)", async () => {
    const { enqueueRelayRequest } = await import("@/lib/melk-api/relay");
    let threw = false;
    try {
      await enqueueRelayRequest({ method: "GET", url: "https://evil.example.com/api" });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  test("B-2) دی‌داپ — دو درخواست همسان همزمان یک صف‌ردیف می‌شوند (attached)", async () => {
    const { enqueueRelayRequest } = await import("@/lib/melk-api/relay");
    const { db } = await import("@/lib/db");
    const a = await enqueueRelayRequest({ method: "GET", url: "https://arus-api.melketabriz.ir/api/apu/x", source: "gate-test" });
    const b = await enqueueRelayRequest({ method: "GET", url: "https://arus-api.melketabriz.ir/api/apu/x", source: "gate-test" });
    expect(a.id).toBe(b.id);
    expect(b.attached).toBe(true);
    await db.relayQueue.deleteMany({ where: { id: a.id } });
  });

  test("B-3) claim اتمیک — یک آیتم فقط به یک دستگاه داده می‌شود", async () => {
    const { enqueueRelayRequest, claimNextRelayRequest, createRelayDevice } = await import("@/lib/melk-api/relay");
    const { db } = await import("@/lib/db");
    // PN-035 (شورا-ن۰۵۷): claimRelayBatch فقط برای دستگاهِ ثبت‌شده امضا می‌کند
    // (راز دستگاه برای امضای دوجهتهٔ آیتم لازم است) — شناسهٔ واقعی دستگاه که
    // createRelayDevice برمی‌گرداند (با پسوند تصادفی) باید استفاده شود.
    const dev1 = await createRelayDevice("test-claim-1", "pn031-b3");
    const dev2 = await createRelayDevice("test-claim-2", "pn031-b3");
    const { id } = await enqueueRelayRequest({ method: "GET", url: "https://pm-api.melketabriz.ir/api/y", source: "gate-test" });
    const first = await claimNextRelayRequest(dev1.deviceId);
    expect(first?.id).toBe(id);
    // آیتم دیگر pending نیست — دستگاه دوم چیزی نمی‌گیرد
    const second = await claimNextRelayRequest(dev2.deviceId);
    expect(second === null || second.id !== id).toBe(true);
    await db.relayQueue.deleteMany({ where: { id } });
  });

  test("B-4) نتیجه — مالکیت دستگاه اجباری؛ پاسخ کامل ذخیره می‌شود", async () => {
    const { enqueueRelayRequest, claimNextRelayRequest, completeRelayRequest, createRelayDevice } = await import("@/lib/melk-api/relay");
    const { db } = await import("@/lib/db");
    const dev = await createRelayDevice("test-owner-1", "pn031-b4");
    const { id } = await enqueueRelayRequest({ method: "GET", url: "https://arus-api.melketabriz.ir/api/apu/z", source: "gate-test" });
    await claimNextRelayRequest(dev.deviceId);
    // دستگاه دیگر نمی‌تواند نتیجه بدهد
    const wrong = await completeRelayRequest({ id, deviceId: "test-owner-2-unknown", httpStatus: 200 });
    expect(wrong.ok).toBe(false);
    expect(wrong.status).toBe(403);
    // مالک واقعی
    const right = await completeRelayRequest({
      id,
      deviceId: dev.deviceId,
      httpStatus: 404,
      contentType: "application/json",
      body: '{"statusCode":404}',
    });
    expect(right.ok).toBe(true);
    const item = await db.relayQueue.findUnique({ where: { id } });
    expect(item?.status).toBe("done");
    expect(item?.responseStatus).toBe(404);
    expect(item?.responseBody).toBe('{"statusCode":404}');
    await db.relayQueue.deleteMany({ where: { id } });
  });

  test("B-5) TTL — آیتم ماندده قدیمی منقضی می‌شود (expireStaleRelayItems)", async () => {
    const { expireStaleRelayItems, RELAY_ITEM_TTL_S } = await import("@/lib/melk-api/relay");
    const { db } = await import("@/lib/db");
    const old = await db.relayQueue.create({
      data: {
        method: "GET",
        url: "https://arus-api.melketabriz.ir/api/apu/old",
        status: "pending",
        fingerprint: "pn031-test-ttl",
        enqueuedAt: new Date(Date.now() - (RELAY_ITEM_TTL_S + 10) * 1000),
        source: "gate-test",
      },
    });
    const n = await expireStaleRelayItems();
    expect(n).toBeGreaterThanOrEqual(1);
    const item = await db.relayQueue.findUnique({ where: { id: old.id } });
    expect(item?.status).toBe("expired");
    await db.relayQueue.deleteMany({ where: { id: old.id } });
  });

  test("B-6) هدرهای عبوری — فقط authorization/content-type/accept نگه داشته می‌شوند (عین Worker)", async () => {
    const { enqueueRelayRequest, RELAY_FORWARD_HEADERS } = await import("@/lib/melk-api/relay");
    const { db } = await import("@/lib/db");
    const { id } = await enqueueRelayRequest({
      method: "GET",
      url: "https://arus-api.melketabriz.ir/api/apu/h",
      headers: {
        authorization: "Bearer tok",
        "content-type": "application/json",
        accept: "application/json",
        "x-melka-target": "must-not-leak", // هرگز نباید عبور کند
        cookie: "must-not-leak",
      },
      source: "gate-test",
    });
    const item = await db.relayQueue.findUnique({ where: { id } });
    const parsed = item?.headersJson ? (JSON.parse(item.headersJson) as Record<string, string>) : {};
    expect(Object.keys(parsed).sort()).toEqual([...RELAY_FORWARD_HEADERS].filter((h) => h !== "content-type" || parsed["content-type"]).sort());
    expect(parsed["x-melka-target"]).toBeUndefined();
    expect(parsed.cookie).toBeUndefined();
    expect(parsed.authorization).toBe("Bearer tok");
    await db.relayQueue.deleteMany({ where: { id } });
    await cleanupRelayTestData();
  });
});

// ───────────────────── C) یکپارچگی proxyFetch / armCall (۴) ─────────────────────

describe("PN-031 · C) یکپارچگی نقطهٔ یگانه و قفل ترتیب", () => {
  test("C-1) حالت رله + میزبان ملک تبریز → مسیر رله (بدون دستگاه برخط = خطای روشن، نه fetch مستقیم)", async () => {
    setEnv("MELK_ARM_RELAY_MODE", "mobile");
    setEnv("MELK_ARM_PROXY_URL", "https://melka-proxy.example.workers.dev"); // حتی با Worker فعال، رله اولویت دارد
    const { proxyFetch } = await import("@/lib/melk-api/proxy");
    const { db } = await import("@/lib/db");
    await db.relayDevice.updateMany({ where: { deviceId: { startsWith: "test-" } }, data: { lastSeenAt: null } });
    let relayError = "";
    try {
      await proxyFetch("https://arus-api.melketabriz.ir/api/apu/ping", { method: "GET" });
    } catch (e) {
      relayError = (e as Error).message;
    }
    expect(relayError).toContain("رلهٔ موبایل");
  });

  test("C-2) حالت رله + میزبان غیرملک‌تبریزی → fetch مستقیم (کنترل‌ها از رله عبور نمی‌کنند)", async () => {
    setEnv("MELK_ARM_RELAY_MODE", "mobile");
    const { proxyFetch } = await import("@/lib/melk-api/proxy");
    const originalFetch = globalThis.fetch;
    let calledUrl = "";
    globalThis.fetch = (async (url: string | URL | Request) => {
      calledUrl = String(url);
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    try {
      const res = await proxyFetch("https://api.divar.ir/v8/postlist", { method: "GET" });
      expect(res.status).toBe(200);
      expect(calledUrl).toBe("https://api.divar.ir/v8/postlist");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("C-3) حالت خاموش (پیش‌فرض) → رفتار PN-029/030 دست‌نخورده (مستقیم)", async () => {
    setEnv("MELK_ARM_RELAY_MODE", undefined);
    setEnv("MELK_ARM_PROXY_URL", undefined);
    setEnv("MELK_PROXY_SECRET", undefined);
    const { proxyFetch } = await import("@/lib/melk-api/proxy");
    const originalFetch = globalThis.fetch;
    let calledUrl = "";
    globalThis.fetch = (async (url: string | URL | Request) => {
      calledUrl = String(url);
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    try {
      await proxyFetch("https://arus-api.melketabriz.ir/api/apu/direct", { method: "GET" });
      expect(calledUrl).toBe("https://arus-api.melketabriz.ir/api/apu/direct");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("C-4) قفل ترتیب (بازنویسی ن۰۶۳) — پرچم MELK_ARM_OFFLINE مرده (حذف کد مرده · PN-038/فاز ۶)؛ در حالت رله armCall هرگز مستقیم به ملک تبریز نمی‌رود (صف رله تصمیم می‌گیرد)", async () => {
    setEnv("MELK_ARM_RELAY_MODE", "mobile");
    setEnv("MELK_ARM_OFFLINE", "1"); // پرچم کهنه — دیگر gate نیست؛ ماژول offline-mode حذف کامل شد
    const { armCall } = await import("@/lib/melk-api/client");
    const originalFetch = globalThis.fetch;
    let directCalled = false;
    let code = "";
    globalThis.fetch = (async () => {
      directCalled = true;
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    try {
      await armCall({ path: "x", baseUrl: "https://arus-api.melketabriz.ir/api/apm/", timeoutMs: 200, maxRetries: 0 });
    } catch (e) {
      code = (e as { code: string }).code ?? "";
    } finally {
      globalThis.fetch = originalFetch;
    }
    expect(code).not.toBe("ARM_OFFLINE"); // کد مرده هرگز برنمی‌گردد
    expect(directCalled).toBe(false); // صفر fetch مستقیم — مسیر رله (صف + گوشی)
  });
});

// ───────────────────── D) UI / env / اسکریپت (۵) ─────────────────────

describe("PN-031 · D) UI، env و اسکریپت Termux", () => {
  test("D-1) بخش تنظیمات «رلهٔ Termux» (ساده‌شدهٔ ن۰۵۴) موجود و داخل پیکرهٔ اتصال ملک تبریز رندر می‌شود", () => {
    const section = readFileSync(join(REPO, "src/core/tiles/tiles/settings/RelaySetupSection.tsx"), "utf8");
    expect(section).toContain("رلهٔ Termux");
    expect(section).toContain("تست تونل");
    expect(section).toContain('role !== "OWNER"');
    const body = readFileSync(join(REPO, "src/core/tiles/tiles/settings/MelkTabrizConnectionSection.tsx"), "utf8");
    expect(body).toContain("<RelaySetupSection");
    // PN-033 (شورا-ن۰۵۴): پاکسازی — APK/QR/رلهٔ مرورگری/فهرست دستگاه‌ها/دکمهٔ ثبت حذف شدند
    expect(section).not.toContain("melka-relay.apk");
    expect(section).not.toContain("apkQr");
    expect(section).not.toContain("browser-poll");
    expect(section).not.toContain("(ثبت دستگاه + QR)"); // برچسب JSX دکمهٔ قدیمی ثبت
    expect(section).not.toContain("activeDevices.map"); // فهرست دستگاه‌ها از UI رفت
    expect(section).toContain("راهنمای ۳ خطی");
  });

  test("D-2) env.platform.json — MELK_ARM_RELAY_MODE=mobile + کلید مستندسازی _pn033 (پاکسازی ن۰۵۴)", async () => {
    const raw = JSON.parse(readFileSync(join(REPO, "env.platform.json"), "utf8")) as Record<string, unknown>;
    expect(raw.MELK_ARM_RELAY_MODE).toBe("mobile");
    expect(typeof raw._pn033).toBe("string");
    expect(String(raw._pn033)).toContain("شورا-ن۰۵۴");
    // PN-033 (شورا-ن۰۵۴): کلیدهای دوران Worker حذف + خاموشی فیوز
    expect(raw).not.toHaveProperty("MELK_ARM_PROXY_URL");
    expect(raw).not.toHaveProperty("MELK_RELAY_ALT_URL");
    expect(raw.MELK_ARM_CIRCUIT_DISABLED).toBe("1");
  });

  test("D-3) اسکریپت bash معتبر — bash -n بدون خطا", async () => {
    const { buildRelayScript } = await import("@/lib/melk-api/relay-script");
    const script = buildRelayScript({ serverUrl: "https://melka.example.com", deviceId: "test-script", deviceSecret: "c".repeat(64) });
    const tmp = "/tmp/pn031-relay-test.sh";
    writeFileSync(tmp, script, { mode: 0o600 });
    expect(() => execSync(`bash -n ${tmp}`)).not.toThrow();
    unlinkSync(tmp);
  });

  test("D-4) اسکریپت — whitelist میزبان + وارسی امضای دوجهته + صفر لاگ محتوا", async () => {
    const { buildRelayScript } = await import("@/lib/melk-api/relay-script");
    const s = buildRelayScript({ serverUrl: "https://melka.example.com", deviceId: "d", deviceSecret: "e".repeat(64) });
    // whitelist: فقط https://*.melketabriz.ir
    expect(s).toContain("https://*.melketabriz.ir/*");
    // امضای دوجهته: پیام RELAY\nid\nmethod\nurl\nsha256(body)\nts
    expect(s).toContain("RELAY\\n%s\\n%s\\n%s\\n%s\\n%s");
    // صفر لاگ محتوا: بدنه/هدر هیچ‌جا echo یا print نمی‌شود (فقط شمارنده و کد)
    expect(s).not.toMatch(/echo\s+"\$RBODY/);
    expect(s).not.toMatch(/echo\s+"\$AUTH/);
  });

  test("D-5) پیکربندی تزریقی اسکریپت — عاری‌سازی کاراکترهای خطرناک bash (ضد تزریق فرمان)", async () => {
    const { buildRelayScript } = await import("@/lib/melk-api/relay-script");
    const s = buildRelayScript({
      serverUrl: 'https://evil.com"; rm -rf /',
      deviceId: "x; rm -rf /",
      deviceSecret: "$(curl evil)",
    });
    // کاراکترهای خطرناک (نقل‌قول · سمی‌کالن · فاصله · دلار) حذف شده‌اند — مقادیر بی‌خطر مانده‌اند
    expect(s).toContain('DEVICE_SECRET="curlevil"');
    expect(s).not.toContain('rm -rf /"');
    expect(s).not.toContain("$(curl evil");
    // هیچ نقل‌قول تزریقی در مقادیر نیست (نشانهٔ بستن رشته و فرار از قرارداد)
    expect(s).not.toContain('evil.com"');
  });
});

// ───────────────────── E) سازگاری — روت‌ها و آینه‌ها (۳) ─────────────────────

describe("PN-031 · E) روت‌ها، آینه‌های v1 و سازگاری", () => {
  const routes = [
    "src/app/api/mobile-relay/poll/route.ts",
    "src/app/api/mobile-relay/result/route.ts",
    "src/app/api/mobile-relay/bootstrap/route.ts",
    "src/app/api/admin/relay/enroll/route.ts",
    "src/app/api/admin/relay/status/route.ts",
    "src/app/api/admin/relay/test/route.ts",
    "src/app/api/admin/relay/revoke/route.ts",
    "src/app/api/admin/relay/qr/route.ts",
    "src/app/api/admin/relay/browser-poll/route.ts",
    "src/app/api/admin/relay/browser-result/route.ts",
  ];
  const mirrors = routes.map((r) => r.replace("src/app/api/", "src/app/api/v1/"));

  test("E-1) همهٔ ۱۰ روت رله موجودند", () => {
    for (const r of routes) expect(existsSync(join(REPO, r))).toBe(true);
  });

  test("E-2) آینه‌های v1 — تک‌منبع حقیقت (re-export سبک)", () => {
    for (const m of mirrors) {
      expect(existsSync(join(REPO, m))).toBe(true);
      const content = readFileSync(join(REPO, m), "utf8");
      expect(content).toMatch(/^export \* from "/m);
    }
  });

  test("E-3) نمای اتصال — فیلد relay (mode/active) بدون راز + وضعیت در /api/connection/status", async () => {
    const src = readFileSync(join(REPO, "src/lib/melk-api/connection-overview.ts"), "utf8");
    expect(src).toContain("relay: relayConfigStatus()");
    expect(src).not.toMatch(/relay:\s*\{[^}]*secret/);
    const route = readFileSync(join(REPO, "src/app/api/connection/status/route.ts"), "utf8");
    expect(route).toContain("getConnectionOverview");
  });
});
