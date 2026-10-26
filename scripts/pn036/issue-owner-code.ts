#!/usr/bin/env bun
// PN-036 · صدور کد نصب تازهٔ مالک — نسل K (رلهٔ Termux)
// همان الگوی PN-031-G: ورود مدیر → enroll → دستور نصب → راستی‌آزمایی زنده
import { createHmac } from "node:crypto";

const PUBLIC_URL = "https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai";

async function main() {
  const masterCode = JSON.parse(await Bun.file("env.platform.json").text()).MASTER_ACCESS_CODE;
  const loginResp = await fetch(`${PUBLIC_URL}/api/auth/master-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ masterCode }),
  });
  if (loginResp.status !== 200) throw new Error(`master-login ${loginResp.status}`);
  const { token } = (await loginResp.json()) as { token: string };

  const enrollResp = await fetch(`${PUBLIC_URL}/api/admin/relay/enroll`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ label: "Poco F3" }),
  });
  if (enrollResp.status !== 200) throw new Error(`enroll ${enrollResp.status}`);
  const enroll = (await enrollResp.json()) as { deviceId: string; bootstrapUrl: string; enrollCode?: string; enrollExpires?: string };
  const code = new URL(enroll.bootstrapUrl).searchParams.get("code") ?? "";

  const { buildInstallCommand } = await import("../../src/lib/melk-api/relay-script");
  const installCommand = buildInstallCommand(PUBLIC_URL, code);

  // راستی‌آزمایی زنده: اسکریپت باید «نسل K» باشد — ۴ نشانگر بحرانی جلسهٔ ۰۵۸
  const b1 = await fetch(`${PUBLIC_URL}/api/mobile-relay/bootstrap?code=${code}`);
  const scriptText = b1.status === 200 ? await b1.text() : "";
  const genK = {
    marker: scriptText.includes("نسل K · PN-036"),
    rawfileJqFix: scriptText.includes('--rawfile b64 "$B64F"'),
    batch20: scriptText.includes("BATCH=20"),
    expressLane: scriptText.includes('run_batch_set "$EXPRESS_JSON" "express"'),
    adaptiveTimeout: scriptText.includes("LIGHT_TIMEOUT=15") && scriptText.includes("HEAVY_TIMEOUT=60"),
    replayDrop: scriptText.includes("رد قطعی در بازپخش"),
  };

  const witness = {
    phase: "PN-036 (شورا-ن۰۵۸) — کد نصب تازهٔ مالک",
    at: new Date().toISOString(),
    pn: "PN-036",
    generation: "K",
    deviceLabel: "poco-f3-owner",
    deviceId: enroll.deviceId,
    maxAttempts: 3,
    validityMinutes: 30,
    installCommand,
    bootstrapUrl: enroll.bootstrapUrl,
    enrollExpires: enroll.enrollExpires,
    servedScriptVerified: { httpStatus: b1.status, ...genK, allPass: Object.values(genK).every(Boolean) },
    ownerSteps: [
      "۱) در Termux فعلی (نسل J): Ctrl+C — توقف رلهٔ کهنه",
      "۲) دستور installCommand را پیست کنید و Enter بزنید",
      "۳) منتظر «✓ اتصال تأیید شد — رلهٔ ملکا فعال است (مسیر اصلی)» — این نسل K است",
      "۴) اپ ملکا → تنظیمات ← اتصال به ملک تبریز ← PM: کدپرسنلی ۴۱۰۰۳۱۳۲۰ ← ارسال کد",
    ],
  };
  await Bun.write("download/pn036/fresh-install-code.json", JSON.stringify(witness, null, 2));
  console.log(`✓ کد نصب نسل K صادر شد: ${enroll.deviceId}`);
  console.log(`  اعتبار: ${enroll.enrollExpires}`);
  console.log(`  راستی‌آزمایی اسکریپت سرو‌شده: ${JSON.stringify(genK)}`);
  if (!Object.values(genK).every(Boolean)) {
    console.error("✗ اسکریپت سرو‌شده نسل K نیست!");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("خطا:", e);
  process.exit(1);
});
