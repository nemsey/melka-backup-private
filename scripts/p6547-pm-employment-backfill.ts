#!/usr/bin/env bun
/**
 * p6547-pm-employment-backfill.ts — بک‌فیل نوع همکاری/درصد سهام/شماره داخلی پرسنل PM
 * --------------------------------------------------------------------------------
 * P6547/گام چهارم-۱: غنی‌سازی ستون‌های فهرست کارشناسان از ساختار فراژرف سامانهٔ PM:
 *   · employeementInfo.typeFa (نوع همکاری: «حق السهم (درصد)» / «حقوق ماهیانه»)
 *   · employeementInfo.shareHolderPercentage (درصد سهام — شاهد: هوشنگ احمدی ۴۷٫۵)
 *   · voipInfo.extentionNumber (شماره داخلی تلفن سازمانی — شاهد: سراج میزانی ۱۰۱۳)
 * اصول: فقط GET · upsert-only · شکست نرم
 */
import { PrismaClient } from "@prisma/client";
import { decryptSecret } from "../src/lib/auth/crypto";
import { armCall } from "../src/lib/melk-api/client";
import { getMelkApiConfig } from "../src/lib/melk-api/config";
import { MELK_ENDPOINTS } from "../src/lib/melk-api/endpoints";
import { pickEmploymentInfo } from "../src/lib/melk-api/pm-acc-sync";
import { writeFileSync } from "node:fs";

const db = new PrismaClient();

/** استخراج شماره داخلی از rawJson (realtors/list — voipInfo آرایه است) */
function pickVoip(rawJson: string | null): string | null {
  if (!rawJson) return null;
  try {
    const d = JSON.parse(rawJson) as Record<string, unknown>;
    const v = d["voipInfo"];
    if (Array.isArray(v) && v.length > 0 && v[0] && typeof v[0] === "object") {
      const ext = (v[0] as Record<string, unknown>)["extentionNumber"];
      if (typeof ext === "string" && ext.trim()) return ext.trim();
      if (typeof ext === "number") return String(ext);
    }
  } catch { /* خام نامعتبر */ }
  return null;
}

async function main() {
  const pm = await db.pmConnection.findFirst();
  const PM_TOKEN = decryptSecret(pm?.tokenEnc ?? "") ?? "";
  console.log(`PM token: ${PM_TOKEN.length} chars`);
  if (!PM_TOKEN) process.exit(1);
  const cfg = getMelkApiConfig();

  // ۱) شماره داخلی — از rawJson موجود (بدون فراخوانی شبکه)
  let voipOk = 0;
  const all = await db.pmPersonnelRecord.findMany({ select: { id: true, rawJson: true } });
  for (const p of all) {
    const ext = pickVoip(p.rawJson);
    if (ext) {
      await db.pmPersonnelRecord.update({ where: { id: p.id }, data: { voipExtension: ext } }).catch(() => undefined);
      voipOk += 1;
    }
  }
  console.log(`voip extensions from rawJson: ${voipOk}/${all.length}`);

  // ۲) نوع همکاری + درصد سهام — از personnelInfo زنده (پرسنلِ فاقد employmentType)
  const pending = await db.pmPersonnelRecord.findMany({
    where: { employmentType: null },
    select: { id: true, fullName: true },
    orderBy: { updatedAt: "asc" },
  });
  console.log(`pending employmentInfo: ${pending.length}`);
  let ok = 0, fail = 0, got = 0;
  const samples: Array<Record<string, unknown>> = [];
  for (const p of pending) {
    try {
      const res = await armCall<unknown>({
        path: MELK_ENDPOINTS.pm.realtorPersonnelInfo(p.id),
        baseUrl: cfg.pmApiBase,
        token: PM_TOKEN,
        timeoutMs: 45_000,
        maxRetries: 1,
      });
      const d = (res.data ?? {}) as Record<string, unknown>;
      const emp = pickEmploymentInfo(d);
      const patch: Record<string, string | number | null> = {};
      if (emp.type) patch.employmentType = emp.type;
      if (emp.sharePercent !== null) patch.sharePercent = emp.sharePercent;
      if (Object.keys(patch).length > 0) {
        await db.pmPersonnelRecord.update({ where: { id: p.id }, data: patch });
        got += 1;
        if (samples.length < 6) samples.push({ id: p.id, fullName: p.fullName, ...patch });
      }
      ok += 1;
    } catch {
      fail += 1;
    }
    await new Promise((r) => setTimeout(r, 220));
  }

  const after = {
    total: await db.pmPersonnelRecord.count(),
    withEmpType: await db.pmPersonnelRecord.count({ where: { employmentType: { not: null } } }),
    withShare: await db.pmPersonnelRecord.count({ where: { sharePercent: { not: null } } }),
    withVoip: await db.pmPersonnelRecord.count({ where: { voipExtension: { not: null } } }),
  };
  const dist: Record<string, number> = {};
  (await db.pmPersonnelRecord.findMany({ where: { employmentType: { not: null } }, select: { employmentType: true } }))
    .forEach((r) => { dist[r.employmentType!] = (dist[r.employmentType!] ?? 0) + 1; });

  const proof = { ranAt: new Date().toISOString(), voipOk, attempted: pending.length, ok, fail, got, after, employmentDist: dist, samples };
  writeFileSync("download/p6547/pm-employment-backfill-proof.json", JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof, null, 2));
  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
