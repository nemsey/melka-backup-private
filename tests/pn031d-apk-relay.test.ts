/**
 * تست‌های PN-031-D — اپ اندروید ملکا + شاخهٔ JSON بوت‌استرپ + شاهدهای بیلد (شورا-ن۰۴۳)
 * ---------------------------------------------------------------------------
 *   A) روت bootstrap — شاخهٔ format=json: همان consumeEnrollCode، خروجی JSON
 *      (deviceId · deviceSecret · serverUrl) با no-store؛ ردّها همچنان 403+reason
 *      پیش از شاخهٔ JSON (سقف ۳ تلاش و سوختن با اولین Poll دست‌نخورده)
 *   B) عملکرد زندهٔ شاخهٔ JSON روی test.db — مصرف کد و پاسخ کامل
 *   C) UI تنظیمات — کارت افزودنی «اپ اندروید» + پابرجایی مسیر Termux (افزودنی، نه جایگزین)
 *   D) پروژهٔ اندروید — قرارداد HMAC + whitelist میزبان + اجزای بقا
 *      (ForegroundService · BootReceiver · SelfHeal · EncryptedPrefs · QR)
 *   E) شاهد بیلد — APK موجود · sha256 منطبق · هیچ شاهد جعلی نیست
 *
 * اجرا: bun test tests/pn031d-apk-relay.test.ts
 */

import { describe, test, expect } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const REPO = join(import.meta.dir, "..");
const BOOTSTRAP = join(REPO, "src/app/api/mobile-relay/bootstrap/route.ts");
const RELAY_UI = join(REPO, "src/core/tiles/tiles/settings/RelaySetupSection.tsx");
const ANDROID_DIR = join(REPO, "melka-relay-android/app/src/main");
const APK_PUBLIC = join(REPO, "public/deliver/pn031d/melka-relay.apk");
const APK_WITNESS = join(REPO, "download/pn031d/apk-build.json");

describe("PN-031-D · A) شاخهٔ JSON بوت‌استرپ", () => {
  test("A-1: شاخهٔ format=json روی روت bootstrap تعریف شده است", () => {
    const src = readFileSync(BOOTSTRAP, "utf8");
    expect(src).toContain('searchParams.get("format")');
    expect(src).toContain('=== "json"');
  });

  test("A-2: شاخهٔ JSON همان کد بخشندهٔ PN-031-C را مصرف می‌کند (منطق موازی ندارد)", () => {
    const src = readFileSync(BOOTSTRAP, "utf8");
    // مصرف کد یک‌بار و پیش از انشعاب خروجی — نه شاخهٔ احراز جداگانه
    expect(src).toContain("await consumeEnrollCode(code, ip)");
    const consumeIdx = src.indexOf("await consumeEnrollCode(code, ip)");
    const jsonIdx = src.indexOf('searchParams.get("format")');
    expect(consumeIdx).toBeGreaterThan(-1);
    expect(jsonIdx).toBeGreaterThan(-1);
    // تعریف wantJson می‌تواند پیش از مصرف باشد اما خروجی JSON حتماً پس از ردّهاست
    const jsonOutIdx = src.indexOf("if (wantJson) {");
    expect(jsonOutIdx).toBeGreaterThan(consumeIdx);
  });

  test("A-3: خروجی JSON شامل deviceId + deviceSecret + serverUrl و no-store است", () => {
    const src = readFileSync(BOOTSTRAP, "utf8");
    const jsonOut = src.slice(src.indexOf("if (wantJson) {"), src.indexOf("const script = buildRelayScript"));
    expect(jsonOut).toContain("deviceId: consumed.device.deviceId");
    expect(jsonOut).toContain("deviceSecret: consumed.device.secret");
    expect(jsonOut).toContain("serverUrl");
    expect(jsonOut).toContain("no-store");
  });

  test("A-4: ردّهای کد (used/limit/expired/invalid/revoked) پیش از شاخهٔ JSON می‌مانند", () => {
    const src = readFileSync(BOOTSTRAP, "utf8");
    const rejectIdx = src.indexOf("if (!consumed.ok) {");
    const jsonIdx = src.indexOf("if (wantJson) {");
    expect(rejectIdx).toBeGreaterThan(-1);
    expect(jsonIdx).toBeGreaterThan(rejectIdx);
  });

  test("A-5: خروجی اسکریپت Termux (سند ۰۳۷/۰۴۰) دست‌نخورده مانده است", () => {
    const src = readFileSync(BOOTSTRAP, "utf8");
    expect(src).toContain("buildRelayScript");
    expect(src).toContain("text/x-shellscript");
  });
});

describe("PN-031-D · B) عملکرد شاخهٔ JSON (test.db)", () => {
  test("B-1: consumeEnrollCode با کد تازه پاسخ کامل برمی‌گرداند (پیش‌نیاز شاخهٔ JSON)", async () => {
    const { db } = await import("@/lib/db");
    const { consumeEnrollCode } = await import("@/lib/melk-api/relay");
    const deviceId = "pn031d-json-test";
    const enrollCode = `pn031d-code-${Date.now()}`;
    await db.relayDevice.upsert({
      where: { deviceId },
      create: {
        deviceId,
        secret: "d".repeat(64),
        label: "تست PN-031-D",
        enrollCode,
        enrollExpires: new Date(Date.now() + 30 * 60 * 1000),
        attemptCount: 0,
      },
      update: { enrollCode, enrolledAt: null, revokedAt: null, attemptCount: 0, enrollExpires: new Date(Date.now() + 30 * 60 * 1000) },
    });
    const r = await consumeEnrollCode(enrollCode, "127.0.0.1");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.device.deviceId).toBe(deviceId);
      expect(r.device.secret).toBe("d".repeat(64));
      expect(r.device.attemptCount).toBe(1);
      expect(r.device.maxAttempts).toBe(3);
    }
    await db.relayDevice.delete({ where: { deviceId } }).catch(() => {});
    await db.$disconnect?.();
  });
});

describe("PN-031-D · C) UI تنظیمات — کارت افزودنی اپ اندروید", () => {
  test("C-1: (ن۰۵۴) کارت APK از UI حذف شد — Termux تنها راه (دستور مالک ۱۴۰۵/۰۷/۲۶)", () => {
    const src = readFileSync(RELAY_UI, "utf8");
    expect(src).not.toContain("/deliver/pn031d/melka-relay.apk");
    expect(src).not.toContain("دانلود اپ (APK)");
    expect(src).not.toContain("QR دانلود");
  });

  test("C-2: (ن۰۵۴) روت QR از UI حذف شد — صفر QR در تنظیمات", () => {
    const src = readFileSync(RELAY_UI, "utf8");
    expect(src).not.toContain("/api/admin/relay/qr?text=");
  });

  test("C-3: مسیر Termux پابرجاست — تست تونل + راهنمای ۳ خطی (ن۰۵۴)", () => {
    const src = readFileSync(RELAY_UI, "utf8");
    expect(src).toContain("تست تونل");
    expect(src).toContain("راهنمای ۳ خطی");
    expect(src).toContain("Termux");
  });
});

describe("PN-031-D · D) پروژهٔ اندروید — قرارداد و اجزای بقا", () => {
  const read = (p: string) => readFileSync(join(ANDROID_DIR, p), "utf8");

  test("D-1: امضای HMAC عین قرارداد سرور (METHOD\\npath\\nsha256\\nts)", () => {
    const signer = read("java/com/melka/relay/HmacSigner.kt");
    expect(signer).toContain("RELAY\\n");
    expect(signer).toContain("HmacSHA256");
    expect(signer).toContain("constantTimeEquals");
  });

  test("D-2: whitelist میزبان سمت گوشی — فقط https زیردامنهٔ melketabriz.ir", () => {
    const client = read("java/com/melka/relay/PollClient.kt");
    expect(client).toContain('endsWith(".melketabriz.ir")');
    expect(client).toContain('u.protocol != "https"');
  });

  test("D-3: وارسی امضای دوجهتهٔ سرور پیش از اجرای هر آیتم", () => {
    const service = read("java/com/melka/relay/RelayService.kt");
    expect(service).toContain("itemSignature");
    expect(service).toContain("constantTimeEquals");
  });

  test("D-4: اجزای بقا — ForegroundService(dataSync) + Boot + SelfHeal + WakeLock + QR", () => {
    const manifest = read("AndroidManifest.xml");
    expect(manifest).toContain('android:name=".RelayService"');
    expect(manifest).toContain('android:foregroundServiceType="dataSync"');
    expect(manifest).toContain("RECEIVE_BOOT_COMPLETED");
    expect(manifest).toContain("QUICKBOOT_POWERON");
    expect(existsSync(join(ANDROID_DIR, "java/com/melka/relay/BootReceiver.kt"))).toBe(true);
    expect(existsSync(join(ANDROID_DIR, "java/com/melka/relay/SelfHealWorker.kt"))).toBe(true);
    expect(existsSync(join(ANDROID_DIR, "java/com/melka/relay/QrScannerActivity.kt"))).toBe(true);
    const service = read("java/com/melka/relay/RelayService.kt");
    expect(service).toContain("PARTIAL_WAKE_LOCK");
  });

  test("D-5: راز دستگاه در ذخیرهٔ رمزنگاری‌شده (EncryptedSharedPreferences)", () => {
    const prefs = read("java/com/melka/relay/RelayPrefs.kt");
    expect(prefs).toContain("EncryptedSharedPreferences");
    expect(prefs).toContain("MasterKey");
  });

  test("D-6: رابط فارسی RTL و رشته‌های راهنمای MIUI", () => {
    const strings = read("res/values/strings.xml");
    expect(strings).toContain("رلهٔ ملکا فعال است");
    expect(strings).toContain("راهنمای بقا در MIUI");
    const mainLayout = read("res/layout/activity_main.xml");
    expect(mainLayout).toContain('android:layoutDirection="rtl"');
  });
});

describe("PN-031-D · E) شاهد بیلد — APK واقعی و منطبق", () => {
  test("E-1: APK در مسیر عمومی موجود و در بازهٔ حجم معقول است", () => {
    expect(existsSync(APK_PUBLIC)).toBe(true);
    const size = statSync(APK_PUBLIC).size;
    expect(size).toBeGreaterThan(1_000_000);
    expect(size).toBeLessThan(20_000_000);
  });

  test("E-2: sha256 شاهد apk-build.json با فایل واقعی یکی است (صفر سنتز)", () => {
    const witness = JSON.parse(readFileSync(APK_WITNESS, "utf8"));
    const actual = createHash("sha256").update(readFileSync(APK_PUBLIC)).digest("hex");
    expect(witness.apk.sha256).toBe(actual);
    expect(witness.apk.versionName).toBe("1.0.0");
    expect(Array.isArray(witness.honestLimitations)).toBe(true);
    expect(witness.honestLimitations.length).toBeGreaterThan(0);
  });
});
