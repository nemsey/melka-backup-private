import { PrismaClient } from "@prisma/client";

/**
 * P6526/ب — شاهد بصری موقت: ست‌کردن areaNamesJson روی «یک» رکورد ARM موجود
 * برای اسکرین‌شات دیالوگ «فایل مناطق» — سپس بازگردانی دقیق مقدار قبلی.
 * قانون حرمت اطلاعات: مقدار قبلی ذخیره و بازگردانی می‌شود (null → null).
 */
const TARGET_ID_FILE = "/home/z/my-project/scripts/p6526-areas-target.json";

async function main() {
  const p = new PrismaClient();
  const mode = process.argv[2] ?? "set";

  if (mode === "set") {
    // جدیدترین رکورد ARM با requestCode معتبر و بدون منطقه
    const rec = await p.requestRecord.findFirst({
      where: { source: "arm", areaNamesJson: null, requestCode: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { id: true, requestCode: true, areaNamesJson: true },
    });
    if (!rec) {
      console.log("NO_TARGET");
      process.exit(1);
    }
    const { writeFileSync } = await import("fs");
    writeFileSync(TARGET_ID_FILE, JSON.stringify({ id: rec.id, old: rec.areaNamesJson }), "utf8");
    await p.requestRecord.update({
      where: { id: rec.id },
      data: {
        areaNamesJson: JSON.stringify([
          "خاوران", "ولیعصر", "چایکنار", "ایل گلی", "باغمیشه", "زعفرانیه", "معجزات",
        ]),
      },
    });
    console.log(`SET ${rec.id} (کد ${rec.requestCode}) — ۷ منطقه موقت`);
  } else if (mode === "restore") {
    const { readFileSync, existsSync, unlinkSync } = await import("fs");
    if (!existsSync(TARGET_ID_FILE)) {
      console.log("NO_STATE");
      process.exit(1);
    }
    const { id, old } = JSON.parse(readFileSync(TARGET_ID_FILE, "utf8")) as { id: string; old: string | null };
    const current = await p.requestRecord.findUnique({ where: { id }, select: { areaNamesJson: true } });
    if (!current) {
      console.log("RECORD_GONE — nothing to restore");
      process.exit(0);
    }
    await p.requestRecord.update({ where: { id }, data: { areaNamesJson: old } });
    const after = await p.requestRecord.findUnique({ where: { id }, select: { areaNamesJson: true } });
    const ok = (after?.areaNamesJson ?? null) === old;
    unlinkSync(TARGET_ID_FILE);
    console.log(`RESTORE ${id} → ${JSON.stringify(old)} — verified=${ok}`);
    if (!ok) process.exit(1);
  }

  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
