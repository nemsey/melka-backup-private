/**
 * PN-055 — حل موبایل همهٔ کاربران/مشاوران CRM (فاز B)
 * کشف: GET /getConsultantNameAndNumber/{vtiger-id} → {name, number} — باز برای حساب سینک
 * منابع کد: ۵۹ actorCode درخواست‌ها + ۹۱ شناسهٔ کارشناسان موجود
 * خروجی: download/pn055/consultant-directory.json + غنی‌سازی ExpertRecord
 * اجرا: bun scripts/pn055-consultants.ts
 */
import { crmLogin } from "@/lib/integrations/melketun/sync";
import { readFileSync, writeFileSync } from "fs";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const secrets = JSON.parse(
  readFileSync("upload/.runtime/melketun-secrets.json", "utf8"),
) as { crm: { base_url: string; username: string; password: string } };
const base = secrets.crm.base_url.replace(/\/$/, "");
const errors: string[] = [];
const jar = await crmLogin(base, secrets.crm.username, secrets.crm.password, errors);
if (errors.length) { console.log("[cons] LOGIN-ERRORS:", errors.join(" | ")); process.exit(1); }

// همهٔ کدهای یکتا: از درخواست‌ها + از کارشناسان موجود (melketun-user-N → 19xN)
const actorCodes: string[] = JSON.parse(readFileSync("download/pn055/user-codes.json", "utf8"));
const experts = await db.expertRecord.findMany({ where: { tenantId: "melketun" }, select: { id: true, personnelCode: true, fullName: true, mobile: true } });
const expertCodes = experts.map((e) => {
  const m = e.id.match(/melketun-user-(\d+)/);
  return m ? `19x${m[1]}` : null;
}).filter((x): x is string => Boolean(x));
const allCodes = [...new Set([...actorCodes, ...expertCodes])];
console.log(`[cons] ${allCodes.length} کد یکتا (${actorCodes.length} از درخواست‌ها + ${expertCodes.length} از کارشناسان)`);

const directory: Record<string, { name: string; number: string }> = {};
let ok = 0, failed = 0;
for (const code of allCodes) {
  try {
    const res = await fetch(`${base}/getConsultantNameAndNumber/${code}`, {
      headers: { Cookie: jar.header(), Accept: "application/json" },
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 200) {
      const text = await res.text();
      if (text.trim().startsWith("{")) {
        const j = JSON.parse(text) as { name?: string; number?: string };
        if (j.name || j.number) {
          directory[code] = { name: String(j.name ?? ""), number: String(j.number ?? "").replace(/\D/g, "") };
          ok++;
        }
      }
    } else failed++;
  } catch { failed++; }
  await sleep(420);
}

writeFileSync("download/pn055/consultant-directory.json", JSON.stringify({ fetchedAt: new Date().toISOString(), count: Object.keys(directory).length, directory }, null, 2));
console.log(`[cons] حل‌شده: ${ok} · شکست: ${failed}`);

// غنی‌سازی ExpertRecord — فقط موبایلِ خالی را پر کن (دکترین بدون نابودی)
let filled = 0;
for (const e of experts) {
  const m = e.id.match(/melketun-user-(\d+)/);
  if (!m) continue;
  const code = `19x${m[1]}`;
  const info = directory[code];
  if (!info?.number || info.number.length < 10) continue;
  if (e.mobile && e.mobile.length >= 10) continue; // موجود است
  await db.expertRecord.update({ where: { id: e.id }, data: { mobile: info.number } });
  filled++;
}
console.log(`[cons] موبایل کارشناس تازه پر شد: ${filled}`);
await db.$disconnect();
process.exit(0);
