#!/usr/bin/env bun
/**
 * PN-031-D · تست زندهٔ شاخهٔ JSON بوت‌استرپ — از URL عمومی اینترنت
 * ---------------------------------------------------------------------------
 * سناریوی کامل اپ اندروید (بدون گوشی):
 *   ۱) seed یک دستگاه تستی با کد معتبر در DB (همان الگوی synthetic-device-test)
 *   ۲) GET {public}/api/mobile-relay/bootstrap?code=…&format=json → انتظار: 200 JSON
 *      با deviceId + deviceSecret + serverUrl (همان چیزی که APK می‌گیرد)
 *   ۳) GET همان مسیر با کد جعلی → انتظار: 403 + reason=invalid (رد پیش از شاخهٔ JSON)
 *   ۴) دانلود APK از URL عمومی → انتظار: 200 + sha256 منطبق
 *   ۵) health از URL عمومی → 200
 *   ۶) پاکسازی دستگاه تستی
 * خروجی: download/pn031d/live-gate-json.json
 */
import { createHash, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "@/lib/db";

const ROOT = "/home/z/my-project";
const OUT = join(ROOT, "download", "pn031d/live-gate-json.json");

function publicBaseUrl(): string {
  if (process.env.MELK_PUBLIC_BASE_URL) return process.env.MELK_PUBLIC_BASE_URL;
  const raw = JSON.parse(readFileSync(join(ROOT, "env.platform.json"), "utf8")) as { MELK_PUBLIC_BASE_URL: string };
  return raw.MELK_PUBLIC_BASE_URL;
}

async function probe(url: string, init?: RequestInit): Promise<{ status: number; body: string; ms: number }> {
  const t0 = Date.now();
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
  const body = await res.text();
  return { status: res.status, body: body.slice(0, 400), ms: Date.now() - t0 };
}

async function main(): Promise<void> {
  const base = publicBaseUrl().replace(/\/+$/, "");
  const result: Record<string, unknown> = { ok: false, ts: new Date().toISOString(), base };
  const checks: Array<{ name: string; pass: boolean; detail: unknown }> = [];
  const deviceId = `pn031d-live-${randomBytes(3).toString("hex")}`;
  const code = randomBytes(18).toString("hex");

  try {
    // ۱) seed دستگاه تستی (پاکسازی در finally)
    await db.relayDevice.create({
      data: {
        deviceId,
        secret: "a".repeat(64),
        label: "تست زندهٔ JSON · PN-031-D",
        enrollCode: code,
        enrollExpires: new Date(Date.now() + 10 * 60 * 1000),
        attemptCount: 0,
      },
    });

    // ۲) شاخهٔ JSON با کد معتبر — همان فراخوانی APK
    const good = await probe(`${base}/api/mobile-relay/bootstrap?code=${code}&format=json`);
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(good.body) as Record<string, unknown>; } catch { /* body truncated */ }
    const goodPass = good.status === 200 && parsed.ok === true && parsed.deviceId === deviceId && typeof parsed.deviceSecret === "string";
    checks.push({ name: "بوت‌استرپ JSON با کد معتبر → 200 + راز دستگاه", pass: goodPass, detail: { status: good.status, deviceId: parsed.deviceId, hasSecret: !!parsed.deviceSecret, serverUrl: parsed.serverUrl, ms: good.ms } });

    // ۳) کد جعلی → 403 invalid (رد پیش از خروجی JSON)
    const bad = await probe(`${base}/api/mobile-relay/bootstrap?code=pn031d-fake-code&format=json`);
    let badParsed: Record<string, unknown> = {};
    try { badParsed = JSON.parse(bad.body) as Record<string, unknown>; } catch { /* ignore */ }
    const badPass = bad.status === 403 && badParsed.reason === "invalid";
    checks.push({ name: "کد جعلی → 403 + reason=invalid (پیام فارسی)", pass: badPass, detail: { status: bad.status, reason: badParsed.reason, error: badParsed.error } });

    // ۴) دانلود APK از URL عمومی
    const apkRes = await fetch(`${base}/deliver/pn031d/melka-relay.apk`, { signal: AbortSignal.timeout(60_000) });
    const apkBuf = Buffer.from(await apkRes.arrayBuffer());
    const actualSha = createHash("sha256").update(apkBuf).digest("hex");
    const witness = JSON.parse(readFileSync(join(ROOT, "download/pn031d/apk-build.json"), "utf8")) as { apk: { sha256: string } };
    const apkPass = apkRes.status === 200 && actualSha === witness.apk.sha256;
    checks.push({ name: "دانلود APK عمومی → 200 + sha256 منطبق", pass: apkPass, detail: { status: apkRes.status, bytes: apkBuf.length, shaMatch: actualSha === witness.apk.sha256 } });

    // ۵) health عمومی
    const health = await probe(`${base}/api/health`);
    checks.push({ name: "health عمومی → 200", pass: health.status === 200, detail: { status: health.status, ms: health.ms } });

    result.checks = checks;
    result.ok = checks.every((c) => c.pass);
  } finally {
    await db.relayDevice.deleteMany({ where: { deviceId } }).catch(() => {});
    await db.$disconnect?.();
  }

  writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ ok: result.ok, checks: checks.map((c) => ({ name: c.name, pass: c.pass })) }, null, 2));
  process.exit(result.ok ? 0 : 1);
}

await main();
