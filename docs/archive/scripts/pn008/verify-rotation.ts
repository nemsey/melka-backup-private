#!/usr/bin/env bun
/** PN-008 BLOCK 2 بند ۲.۱ — راستی‌آزمایی چرخش: خزانهٔ PM با کلید تازه رمزگشایی و پروب زنده می‌شود */
import { readFileSync, writeFileSync } from "node:fs";
const platform = JSON.parse(readFileSync("/home/z/my-project/env.platform.json", "utf-8"));
process.env.MELK_TOKEN_KEY = platform.MELK_TOKEN_KEY;
process.env.DATABASE_URL ??= platform.DATABASE_URL;
const { PrismaClient } = await import("@prisma/client");
const { decryptSecret } = await import("../../src/lib/auth/crypto");
const { armCall } = await import("../../src/lib/melk-api/client");
const { MELK_ENDPOINTS } = await import("../../src/lib/melk-api/endpoints");

const db = new PrismaClient();
const out: any = { task: "PN-008 BLOCK 2 — چرخش MELK_TOKEN_KEY", at: new Date().toISOString() };

// ۱) رمزگشایی خزانه‌ها با کلید تازه
const pm = await db.pmConnection.findFirst();
const pmToken = decryptSecret(pm?.tokenEnc ?? "") ?? "";
out.pmVaultDecrypts = pmToken.length > 0;
const arm = await db.armConnection.findFirst({ orderBy: { lastRefreshedAt: "desc" } });
const armToken = decryptSecret(arm?.tokenEnc ?? "") ?? "";
out.armVaultDecrypts = armToken.length > 0;

// ۲) پروب زندهٔ PM با توکن چرخیده
try {
  const r = await armCall({ path: MELK_ENDPOINTS.pm.realtorsList, baseUrl: "https://pm-api.melketabriz.ir/api/", token: pmToken, timeoutMs: 30000, maxRetries: 0, query: { page: 1, limit: 2 } });
  out.pmProbeWithRotatedToken = Array.isArray((r.data as any)?.list) ? "OK" : "SHAPE?";
} catch (e: any) { out.pmProbeWithRotatedToken = "FAIL:" + String(e?.code ?? e?.message).slice(0, 80); }

// ۳) شمارش جلسات فعال (تداوم نشست‌ها — توکن نشست هش است نه رمز؛ اما توکن‌های ARM درون آن چرخیده‌اند)
out.activeSessions = await db.session.count({ where: { expiresAt: { gt: new Date() } } });

// ۴) اثر انگشت کلید (بدون افشای کلید)
const { createHash } = await import("node:crypto");
out.newKeyFingerprint = createHash("sha256").update(platform.MELK_TOKEN_KEY).digest("hex").slice(0, 16);
out.oldKeyWasPublicTestString = true; // یافتهٔ BLOCK 1: کلید قبلی رشتهٔ تست عمومی بود

writeFileSync("/home/z/my-project/download/pn008/key-rotation.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 1));
await db.$disconnect();
