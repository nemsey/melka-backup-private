/**
 * PN-055 — ترمیم نگاشت ستون‌ها (rawOwnerName = مالک واقعی · ownerName = کارشناس)
 * ادغام اولیهٔ pn055-merge نام مالک واقعی را به‌اشتباه در ownerName (ستون کارشناس)
 * نوشت. این ترمیم: برای هر آگهیِ منبعِ خزش، مالک واقعی → rawOwnerName و
 * ownerName ← realtorNameNorm (بازیابی نام کارشناس).
 * اجرا: bun scripts/pn055-repair-columns.ts
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync, existsSync } from "fs";

const db = new PrismaClient();

function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  const out: T[] = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line) as T); } catch { /* ناقص */ }
  }
  return out;
}

// نقشهٔ مالک واقعی از همهٔ منابع خزش
const ownerByFid = new Map<string, string>(); // fid → real owner name
for (const r of readJsonl<{ fid: string; ownerName: string }>("download/pn055/filing-details.jsonl")) {
  if (r.fid && r.ownerName) ownerByFid.set(r.fid, r.ownerName);
}
for (const r of readJsonl<{ fid: string; ownerName: string }>("download/pn055/myfilings-details.jsonl")) {
  if (r.fid && r.ownerName && !ownerByFid.has(r.fid)) ownerByFid.set(r.fid, r.ownerName);
}
for (const line of readJsonl<{ pid: string; relatedFilings: { id: string; ownerName: string }[] }>("download/pn055/pot-details.jsonl")) {
  for (const rf of line.relatedFilings ?? []) {
    if (rf.id && rf.ownerName && !ownerByFid.has(rf.id)) ownerByFid.set(rf.id, rf.ownerName);
  }
}

console.log(`[repair] ${ownerByFid.size} آگهی با مالک واقعی از خزش`);

let moved = 0, restored = 0, alreadyOk = 0;
for (const [fid, realOwner] of ownerByFid) {
  try {
    const rec = await db.propertyRecord.findUnique({ where: { id: fid }, select: { ownerName: true, rawOwnerName: true, realtorNameNorm: true, tenantId: true } });
    if (!rec || rec.tenantId !== "melketun") continue;

    // اگر مالک واقعی در ownerName (ستون کارشناس) نشسته → جابه‌جا کن
    const data: Record<string, string | null> = {};
    if (rec.ownerName === realOwner && rec.realtorNameNorm && rec.realtorNameNorm !== realOwner) {
      data.rawOwnerName = realOwner;
      data.ownerName = rec.realtorNameNorm; // بازیابی نام کارشناس
      restored++;
    } else if (!rec.rawOwnerName) {
      data.rawOwnerName = realOwner;
      moved++;
    } else {
      alreadyOk++;
      continue;
    }
    if (Object.keys(data).length) await db.propertyRecord.update({ where: { id: fid }, data });
  } catch (e) {
    console.log(`[repair] ${fid} خطا: ${String(e).slice(0, 60)}`);
  }
}

console.log(`[repair] ✅ جابه‌جایی: ${moved} · بازیابی کارشناس: ${restored} · از قبل درست: ${alreadyOk}`);
await db.$disconnect();
process.exit(0);
