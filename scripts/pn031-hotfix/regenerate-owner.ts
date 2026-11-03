#!/usr/bin/env bun
/**
 * regenerate-owner.ts — صدور کد تازهٔ مالک + QR (PN-031-HOTFIX · فاز ۳)
 * ---------------------------------------------------------------------------
 * ۱) ابطال رسمی کد قدیمی جلسهٔ ۰۳۷ (cff39acd… — منقضی طبیعی، هرگز مصرف نشد)
 *    + ابطال دو دستگاه یتیم همان دوران (هرگز اسکریپت ندیدند)
 * ۲) ثبت دستگاه تازهٔ مالک «Poco F3» از خودِ روت واقعی از URL عمومی —
 *    عین دکمهٔ «راه‌اندازی رله» در تنظیمات (کد ۳۰دقیقه‌ای یک‌بارمصرف)
 * ۳) ساخت QR (PNG + SVG) از متن دستور نصب — عین روت QR برنامه
 * ۴) شاهد regenerated.json (بدون راز — کد bootstrap راز نیست، یک‌بارمصرف است)
 */
import { writeFileSync, mkdirSync } from "node:fs";
import QRCode from "qrcode";
import { PrismaClient } from "@prisma/client";

const PUBLIC_URL = "https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai";
const OUT_DIR = "download/pn031-hotfix";
const OLD_CODE_PREFIX = "cff39acdd88837db58d6001f9f10d5733774";

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const prisma = new PrismaClient();

  // ─── ۱) ابطال رسمی دارایی‌های کهنه ───
  const oldInvalidated = await prisma.relayDevice.updateMany({
    where: { enrollCode: OLD_CODE_PREFIX },
    data: { enrollCode: null, enrollExpires: null, revokedAt: new Date() },
  });
  const staleDevices = await prisma.relayDevice.findMany({
    where: { deviceId: { in: ["poco-f3-420b75", "poco-f3-232079"] }, revokedAt: null },
    select: { deviceId: true },
  });
  const staleRevoked = await prisma.relayDevice.updateMany({
    where: { deviceId: { in: ["poco-f3-420b75", "poco-f3-232079"] }, revokedAt: null },
    data: { revokedAt: new Date(), enrollCode: null, enrollExpires: null },
  });
  console.log(`ابطال کد قدیمی: ${oldInvalidated.count} · ابطال دستگاه‌های یتیم: ${staleRevoked.count}`);

  // ─── ۲) ثبت دستگاه تازه از خودِ روت واقعی (URL عمومی) ───
  const masterCode = (JSON.parse((await Bun.file("env.platform.json").text())) as Record<string, string>).MASTER_ACCESS_CODE;
  const loginRes = await fetch(`${PUBLIC_URL}/api/auth/master-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ masterCode }),
  });
  if (!loginRes.ok) throw new Error(`ورود مدیر: HTTP ${loginRes.status}`);
  const { token } = (await loginRes.json()) as { token: string };

  const enrollRes = await fetch(`${PUBLIC_URL}/api/admin/relay/enroll`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ label: "Poco F3" }),
  });
  if (!enrollRes.ok) throw new Error(`ثبت دستگاه: HTTP ${enrollRes.status} — ${await enrollRes.text()}`);
  const enroll = (await enrollRes.json()) as {
    ok: boolean; deviceId: string; label: string; installCommand: string; bootstrapUrl: string; enrollExpires: string;
  };
  console.log(`دستگاه تازه: ${enroll.deviceId} (اعتبار تا ${enroll.enrollExpires})`);

  // وارسی قانون جلسهٔ ۰۳۸ — فقط URL عمومی
  if (!enroll.installCommand.includes(`${PUBLIC_URL}/api/mobile-relay/bootstrap?code=`) || enroll.installCommand.includes("0.0.0.0")) {
    throw new Error("دستور نصب URL عمومی ندارد — قانون ۰۳۸ نقض شد");
  }

  // ─── ۳) QR — عین پیکربندی روت /api/admin/relay/qr ───
  await QRCode.toFile(`${OUT_DIR}/qr-install-command.png`, enroll.installCommand, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 640,
    color: { dark: "#052e2b", light: "#ffffff" },
  });
  const svg = await QRCode.toString(enroll.installCommand, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    width: 320,
  });
  writeFileSync(`${OUT_DIR}/qr-install-command.svg`, svg);

  // ─── ۴) شاهد ───
  const witness = {
    phase: "PN-031-HOTFIX · فاز ۳ — تولید مجدد QR و دستور (جلسهٔ فوری ۰۳۸)",
    generatedAt: new Date().toISOString(),
    publicUrl: PUBLIC_URL,
    invalidated: {
      oldBootstrapCode: `${OLD_CODE_PREFIX.slice(0, 10)}… (کامل در صورت‌جلسهٔ ۰۳۸) — منقضی طبیعی ۰۹:۲۸Z + ابطال رسمی`,
      orphanDevices: staleDevices.map((d) => d.deviceId),
    },
    newEnrollment: {
      deviceId: enroll.deviceId,
      label: enroll.label,
      installCommand: enroll.installCommand,
      bootstrapUrl: enroll.bootstrapUrl,
      enrollExpires: enroll.enrollExpires,
      validityMinutes: 30,
      singleUse: true,
      note: "کد یک‌بارمصرف ۳۰دقیقه‌ای است — اگر منقضی شد، مالک از تنظیمات ملکا (بخش رلهٔ موبایل) دکمهٔ راه‌اندازی را دوباره بزند؛ اکنون همان دکمه هم URL عمومی می‌سازد.",
    },
    files: ["qr-install-command.png", "qr-install-command.svg", "regenerated.json"],
    verdict: "PASS — کد تازه از روت واقعی و از URL عمومی صادر شد",
  };
  writeFileSync(`${OUT_DIR}/regenerated.json`, JSON.stringify(witness, null, 1));
  console.log("شاهد: download/pn031-hotfix/regenerated.json");
  console.log("\n═══ دستور نصب تازهٔ مالک ═══");
  console.log(enroll.installCommand);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("خطا:", e instanceof Error ? e.message : e);
  process.exit(1);
});
