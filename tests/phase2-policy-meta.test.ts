/**
 * تست‌های P2-06 — متادیتای نسخه سیاست (فقط افزودنی)
 * ------------------------------------------------------
 * قرارداد:
 *  ۱) ستون‌های جدید موجودند و nullable/default هستند
 *  ۲) ستون active قدیمی دست‌نخورده (دو‌راهه) — منطق یادگیری PHASE 2 همان active را می‌خواند
 *  ۳) backfill: active=true ⇒ status="active" | active=false ⇒ status="retired"
 *  ۴) منطق یادگیری PHASE 2 صفر تغییر — هیچ مسیری ستون‌های جدید را نمی‌خواند/نمی‌نویسد
 */

import { describe, expect, test, afterAll } from "bun:test";

const { db } = await import("@/lib/db");

const TILE = "p206-meta-tile";
const createdVersions: number[] = [];

afterAll(async () => {
  await db.agentPolicyVersion.deleteMany({ where: { tileId: TILE } });
  await db.$disconnect();
});

describe("P2-06 — ستون‌های متادیتای سیاست", () => {
  test("ساختار: ۸ ستون جدید nullable/default — Prisma client آنها را می‌شناسد", async () => {
    // نمونه create بدون ستون‌های جدید ⇒ موفق (همه اختیاری)
    const row = await db.agentPolicyVersion.create({
      data: {
        tileId: TILE,
        version: 1,
        content: "{}",
        rationale: "تست P2-06",
        active: false,
      },
    });
    createdVersions.push(row.version);

    expect(row.modelVersion).toBeNull();
    expect(row.featureVersion).toBeNull();
    expect(row.trainingWindow).toBeNull();
    expect(row.evaluationWindow).toBeNull();
    expect(row.metricsJson).toBeNull();
    expect(row.createdBy).toBeNull();
    expect(row.approvedBy).toBeNull();
    expect(row.rollbackTarget).toBeNull();
    // status پیش‌فرض "active" (طبق default اسکیما) — دو‌راهه با active
    expect(row.status).toBe("active");
    // ستون قدیمی سالم
    expect(row.active).toBe(false);
  });

  test("create با مقادیر متادیتا (برای PHASE 6/9) پذیرفته می‌شود — بدون اثر در PHASE 2", async () => {
    const row = await db.agentPolicyVersion.create({
      data: {
        tileId: TILE,
        version: 2,
        content: "{}",
        rationale: "با متادیتا",
        active: true,
        modelVersion: "feedback-weighted-v1",
        featureVersion: "tf-cosine-v1",
        trainingWindow: "P90D",
        evaluationWindow: "P14D",
        metricsJson: JSON.stringify({ precision: 0.8 }),
        createdBy: "910001",
        approvedBy: "910001",
        status: "active",
        rollbackTarget: 1,
      },
    });
    createdVersions.push(row.version);
    expect(row.modelVersion).toBe("feedback-weighted-v1");
    expect(row.rollbackTarget).toBe(1);
  });

  test("backfill قاعده: active=true ⇒ status=active؛ active=false ⇒ status=retired (idempotent)", async () => {
    // وضعیت کنونی ردیف‌های تست
    await db.agentPolicyVersion.updateMany({ where: { tileId: TILE, version: 1 }, data: { status: "active", active: false } });
    // بازگرداندن قاعده (همان منطق backfill نهایی)
    await db.agentPolicyVersion.updateMany({ where: { tileId: TILE, active: true }, data: { status: "active" } });
    await db.agentPolicyVersion.updateMany({ where: { tileId: TILE, active: false }, data: { status: "retired" } });

    const v1 = await db.agentPolicyVersion.findUnique({ where: { tileId_version: { tileId: TILE, version: 1 } } });
    const v2 = await db.agentPolicyVersion.findUnique({ where: { tileId_version: { tileId: TILE, version: 2 } } });
    expect(v1?.active).toBe(false);
    expect(v1?.status).toBe("retired");
    expect(v2?.active).toBe(true);
    expect(v2?.status).toBe("active");
  });

  test("منطق یادگیری PHASE 2 فقط active را می‌خواند — findActive({ active: true }) همچنان کار می‌کند", async () => {
    const activeRow = await db.agentPolicyVersion.findFirst({ where: { tileId: TILE, active: true } });
    expect(activeRow?.version).toBe(2);
    // و Repository سیاست (مسیر واقعی ایجنت‌ها) بر همان ستون قدیمی فیلتر می‌کند
    const { getPolicyRepository } = await import("@/core/repositories");
    const viaRepo = await getPolicyRepository().findActive(TILE);
    expect(viaRepo?.version).toBe(2);
  });

  test("دو‌راهه: مسیر یادگیری قدیمی فقط active را جابه‌جا می‌کند — status دست‌نخورده می‌ماند", async () => {
    // گواهی جدایی مسیرها: activateVersion انبار فقط active را تغییر می‌دهد؛
    // ستون status از پیش‌فرض خودش پیروی می‌کند (نگهداری واقعی آن در PHASE 9).
    const { getPolicyRepository } = await import("@/core/repositories");
    const repo = getPolicyRepository();
    const v2 = await repo.findByTileAndVersion(TILE, 2);
    expect(v2?.active).toBe(true);
    await repo.activateVersion(TILE, v2!.id, new Date()); // بازفعال‌سازی همان نسخه
    const after = await repo.findByTileAndVersion(TILE, 2);
    expect(after?.active).toBe(true);
    // و ردیف غیرفعال این تست قاعده backfill را حفظ کرده (تست قبل)
    const v1 = await db.agentPolicyVersion.findUnique({ where: { tileId_version: { tileId: TILE, version: 1 } } });
    expect(v1?.status).toBe("retired");
    expect(v1?.active).toBe(false);
    // نکته: ردیف‌های ساخته‌شده توسط مسیر قدیمی (ایجنت‌های دیگر در همین بسته)
    // می‌توانند active=false با status="active" داشته باشند — این «دو‌راهه»
    // عمدی است و PHASE 9 نگهداری status را برعهده می‌گیرد.
  });

  test("صفر استفاده در کد PHASE 2 — ستون‌های جدید فقط در اسکیما هستند", async () => {
    const source = await Bun.file(`${import.meta.dir}/../src/core/agent/base-agent.ts`).text();
    expect(source).not.toContain("modelVersion");
    expect(source).not.toContain("metricsJson");
    expect(source).not.toContain("rollbackTarget");
    expect(source).toContain("active: true"); // همان مسیر قدیمی
  });
});
