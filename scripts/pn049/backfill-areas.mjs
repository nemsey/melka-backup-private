// ============================================================================
// PN-049/گام ۱-الف — backfill تجزیهٔ مناطق چندگانهٔ درخواست‌های ملکتون
// ============================================================================
// ریشهٔ مشکل: سینک قدیمی رشتهٔ خام مناطق CRM ملکتون («آبرسان , دارایی , رضانژاد
// جنوبی») را به‌صورت «یک منطقه» ذخیره می‌کرد؛ لذا سلول «فایل مناطق» (>۳ منطقه
// — همان الگوی ملک تبریز P6526/ب) هرگز برای ملکتون فعال نمی‌شد.
// این اسکریپت رکوردهای موجود را «درجاً» تجزیه می‌کند:
//   • فقط ردیف‌هایی که آرایهٔ ذخیره‌شده دقیقاً ۱ عنصر «چندمنطقه‌ای» دارد → تجزیه
//   • ردیف‌های آرایهٔ چندعنصری (اگر روزی درست نوشته شده باشند) → دست‌نخورده
//   • هیچ ردیفی حذف/اضافه نمی‌شود؛ هیچ نام منطقه‌ای گم نمی‌شود (قانون دادهٔ مقدس)
//   • areaNamesJsonِ تهی (null) واقعی → دست‌نخورده (CRM خودش تهی داده)
// شاهد: g6 sacred-integrity قبل/بعد باید بدون رگرسیون PASS باشد.
// ============================================================================
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

function parseAreas(raw) {
  if (!raw) return [];
  return String(raw).split(/[،,]/).map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
}

async function main() {
  const rows = await p.requestRecord.findMany({
    where: { tenantId: "melketun", areaNamesJson: { not: null } },
    select: { id: true, requestCode: true, areaNamesJson: true },
  });
  const distBefore = {};
  let updated = 0, skippedMulti = 0, skippedSingle = 0, gt3After = 0, gt3Before = 0, maxAfter = 0;
  const samples = [];

  for (const r of rows) {
    let arr;
    try { arr = JSON.parse(r.areaNamesJson); } catch { continue; }
    if (!Array.isArray(arr)) continue;
    const before = arr.length;
    distBefore[before] = (distBefore[before] || 0) + 1;
    if (before > 3) gt3Before++;

    if (before > 1) { skippedMulti++; if (before > 3) gt3After++; if (before > maxAfter) maxAfter = before; continue; }

    const raw0 = typeof arr[0] === "string" ? arr[0] : "";
    const parsed = parseAreas(raw0);
    // تک‌منطقه‌ای واقعی (بدون جداکننده) → هیچ تغییری لازم نیست
    if (parsed.length <= 1) { skippedSingle++; if (before > 3) gt3After++; if (before > maxAfter) maxAfter = before; continue; }

    await p.requestRecord.update({
      where: { id: r.id },
      data: { areaNamesJson: JSON.stringify(parsed) },
    });
    updated++;
    if (parsed.length > 3) gt3After++;
    if (parsed.length > maxAfter) maxAfter = parsed.length;
    if (samples.length < 5) samples.push({ code: r.requestCode, before: raw0.slice(0, 80), afterCount: parsed.length });
  }

  console.log(JSON.stringify({
    ok: true,
    rowsWithAreas: rows.length,
    updated: updated,
    skippedAlreadyMulti: skippedMulti,
    skippedGenuineSingle: skippedSingle,
    fileModeBefore_gt3: gt3Before,
    fileModeAfter_gt3: gt3After,
    maxAreasPerRowAfter: maxAfter,
    samples,
  }, null, 1));
  await p.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
