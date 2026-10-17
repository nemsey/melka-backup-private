/**
 * PN-005 — بازیابی زنجیرهٔ کد مستر سه‌لایه (نقطهٔ ۲ دستور مالک)
 * ================================================================
 * ریشهٔ «کدمستر مالک کار نمی‌کند» پس از پایان PN-003:
 *   بازنشانی محیط پلتفرم (کامیت خودکار e95b8d0e در ۱۹:۲۲) دو خط .env را حذف کرد
 *   (MASTER_ACCESS_CODE + MELK_SYNC_MODE)، فایل .env.local را کامل پاک کرد و
 *   دیتابیس با db:push بازسازی شد → AppMeta.masterCodeHash هم از دست رفت.
 *   نتیجه: /api/health → masterAuth:"none" → ورود مالک 503.
 *
 * بازیابی عین معماری سه‌لایهٔ PN-002/PN-003:
 *   لایه ۱: .env.local با کد واقعی (۸۰۲۱۱۱۸۶ — از تاریخچهٔ PN-003)
 *   لایه ۲: هش SHA-256 در AppMeta دیتابیس (بقای بازنشانی محیط)
 *   لایه ۳: کد تستی عمومی ۸ صفر هرگز پذیرفته نمی‌شود (SEC-1)
 */
import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { writeFileSync, readFileSync, existsSync } from "node:fs";

const ENV_LOCAL = "/home/z/my-project/.env.local";
const ENV_FILE = "/home/z/my-project/.env";
const DB_URL = "file:/home/z/my-project/db/custom.db";

// کد مستر واقعی مالک — عین PN-003 (غلط تایپی ۸۰۲۲۱۱۸۶ رد می‌شود)
const MASTER_CODE = process.env.PN005_MASTER_CODE ?? "80211186";

function sha256(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

async function main() {
  // ── گارد فرمت ──
  if (!/^[0-9]{8}$/.test(MASTER_CODE)) throw new Error("bad master code format");
  if (MASTER_CODE === "00000000") throw new Error("public test code rejected");
  if (MASTER_CODE === "80221186") throw new Error("known typo code rejected (PN-003 regression)");
  if (new Set(MASTER_CODE).size < 2) throw new Error("repetitive digit code rejected");

  // ── لایه ۱: .env.local ──
  writeFileSync(
    ENV_LOCAL,
    `MASTER_ACCESS_CODE=${MASTER_CODE}\nMELK_SYNC_MODE=incremental\n`,
    "utf8",
  );
  console.log("[layer1] .env.local restored (MASTER_ACCESS_CODE + MELK_SYNC_MODE=incremental)");

  // ── الگوی P6547 برای .env (کد تستی عمومی + حالت incremental — عین PN-002/PN-003) ──
  let envTxt = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : "";
  if (!/^DATABASE_URL=/m.test(envTxt)) {
    envTxt = `DATABASE_URL=file:/home/z/my-project/db/custom.db\n` + envTxt;
  }
  if (!/^MASTER_ACCESS_CODE=/m.test(envTxt)) {
    envTxt = envTxt.trimEnd() + `\nMASTER_ACCESS_CODE=00000000\n`;
  }
  if (!/^MELK_SYNC_MODE=/m.test(envTxt)) {
    envTxt = envTxt.trimEnd() + `\nMELK_SYNC_MODE=incremental\n`;
  }
  writeFileSync(ENV_FILE, envTxt.trimEnd() + "\n", "utf8");
  console.log("[env-pattern] .env restored to P6547 pattern (public test code + incremental)");

  // ── لایه ۲: هش در AppMeta ──
  const db = new PrismaClient({ datasources: { db: { url: DB_URL } } });
  try {
    const hash = sha256(MASTER_CODE);
    const before = await db.appMeta.findUnique({ where: { id: "singleton" } });
    await db.appMeta.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", masterCodeHash: hash },
      update: { masterCodeHash: hash },
    });
    const after = await db.appMeta.findUnique({ where: { id: "singleton" } });
    console.log(`[layer2] AppMeta.masterCodeHash: ${before?.masterCodeHash ? "was-present" : "was-absent"} → ${after?.masterCodeHash?.slice(0, 12)}…`);
    if (after?.masterCodeHash !== hash) throw new Error("hash not persisted!");
    console.log("[verify] sha256(env) == AppMeta.masterCodeHash ✓");
    // همانی با .env.local
    const envLocalCode = readFileSync(ENV_LOCAL, "utf8").match(/^MASTER_ACCESS_CODE=([0-9]{8})$/m)?.[1];
    if (envLocalCode !== MASTER_CODE) throw new Error(".env.local mismatch");
    console.log("[verify] .env.local code == hash source ✓ (three layers consistent)");
  } finally {
    await db.$disconnect();
  }
  console.log("MASTER-CHAIN RECOVERY: DONE");
}

main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
