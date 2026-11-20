/**
 * DIR-FF-TILE-003 · تکمیل رابعاً — نوسازی نگاشت کالیبراسیون مغز ملکا
 * ---------------------------------------------------------------------------
 * زمینه: نگاشت cal-v1-20261003 (بازنمایی مصوبهٔ تصمیم ۱ جلسه ۰۳۳) بر ۳۸۶ جفت
 * ساخته شد؛ اکنون ۵٬۴۵۶ پیامد واقعی در خط است و نگاشت کهنه در جهت معکوس عمل
 * می‌کند (کالیبره ۰٫۲۳۹۸ > خام ۰٫۲۳۷۶ — شکست تست م-۸-۱۱).
 *
 * درمان عین مصوبهٔ شورا (تصمیم ۱ — «recalibrate با قید نظارتی»):
 *   ۱) جفت‌سازی عین موتور P7 (پیش‌بینی ↔ پیامد، پنجرهٔ ۳۶۵۰ روز)
 *   ۲) تقسیم طبقه‌ای قطعی seed=۴۲ (نصف fit / نصف holdout)
 *   ۳) ساخت نگاشت تازه روی fit (لاپلاس +۱)
 *   ۴) قید نظارتی روی holdout: ≥۱۵ پیامد تازه در ناحیهٔ ۰٫۴-۰٫۶ +
 *      تأیید جهت بی‌قاعدگی + بهبود Brier
 *   ۵) تأیید کل‌مجموعه (شاهکار تست م-۸-۱۱: کالیبره ≤ خام)
 *   ۶) فقط اگر همه سبز بودند → نوشتن cal-v2 (نگاشت کهنه در بکاپ محفوظ)
 *
 * استفاده: bun run scripts/dir-ff-tile-003/rebuild-calibration-map.ts [--apply]
 *   (پیش‌فرض dry-run — بدون نوشتن)
 */

import { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = "/home/z/my-project";
const DATA_DIR = join(ROOT, "intelligence-data");
const MAP_PATH = join(DATA_DIR, "calibration-map.json");
const BACKUP_DIR = join(ROOT, "backups", "calibration-map-cal-v1-20261003");

const APPLY = process.argv.includes("--apply");

/* ── ۱) جفت‌سازی عین موتور P7 ── */
interface RawPrediction {
  predictionId: string;
  predictionType?: string;
  probability: number;
  predictedAt?: string;
  expectedTimeWindow?: { maxDays?: number };
}
interface RawOutcome {
  predictionId: string;
  outcomeId?: string;
  occurredAt: string;
  evidence?: { observed?: number; status?: string };
}

function loadJsonl<T>(file: string): T[] {
  const p = join(DATA_DIR, file);
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as T);
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function buildPairs(): { predictionId: string; predictedValue: number; observedValue: number }[] {
  const predictions = loadJsonl<RawPrediction>("predictions.jsonl");
  const outcomes = loadJsonl<RawOutcome>("outcomes.jsonl");
  const byId = new Map(predictions.map((p) => [p.predictionId, p]));
  const now = Date.now();
  const pairs: { predictionId: string; predictedValue: number; observedValue: number }[] = [];
  for (const o of outcomes) {
    const p = byId.get(o.predictionId);
    if (!p) continue;
    const ageDays = (now - new Date(o.occurredAt).getTime()) / 86400000;
    if (ageDays > 3650) continue;
    const observed = o.evidence?.observed ?? 0;
    pairs.push({
      predictionId: o.predictionId,
      predictedValue: clamp(p.probability, 0, 1),
      observedValue: observed === 1 ? 1 : 0,
    });
  }
  return pairs;
}

/* ── ۲) اجرا ── */
async function main() {
  const calibration = await import("@/core/intelligence/calibration/calibration-map");
  const { buildCalibrationMap, stratifiedSplitPairs, verifyCalibrationOnHoldout, calibratePairs, brierScore } = calibration;
  type CalibrationPair = calibration.CalibrationPair;

  const pairs = buildPairs() as CalibrationPair[];
  console.log(`جفت‌ها: ${pairs.length}`);

  const { fit, holdout } = stratifiedSplitPairs(pairs, 42);
  console.log(`تقسیم طبقه‌ای: fit=${fit.length} · holdout=${holdout.length}`);

  const map = buildCalibrationMap(fit, {
    version: "cal-v2-20261120",
    approval: {
      source: "شورای عالی ملکا — جلسهٔ راهبردی ۰۳۳ (ملکا-شورا-۱۴۰۵-۰۳۳) · تصمیم ۱",
      decision:
        "اجرای recalibrate مصوب (نگاشت قطعه‌ای + لاپلاس + قید نظارتی holdout) — نوسازی cal-v2 بر پیامدهای واقعی تازه چون نگاشت cal-v1-20261003 (۳۸۶ جفت) کهنه شده بود و جهتش معکوس گشته بود",
      approvedAt: "2026-10-03T00:00:00.000Z",
    },
  });
  console.log("قطعه‌های نگاشت تازه:");
  for (const s of map.segments) {
    console.log(`  [${s.lo}, ${s.hi}) → from ${s.from} to ${s.to} (n=${s.fitN}, pos=${s.fitPositives})`);
  }

  /* ── ۴) قید نظارتی روی holdout ── */
  const verification = verifyCalibrationOnHoldout(map, holdout);
  console.log("راستی‌آزمایی holdout:", JSON.stringify(verification, null, 1));

  /* ── ۵) شاهکار کل‌مجموعه (عین ادعای تست م-۸-۱۱) ── */
  const rawFull = brierScore(pairs);
  const calFull = brierScore(calibratePairs(map, pairs));
  console.log(`کل‌مجموعه: خام=${rawFull.toFixed(4)} · کالیبره=${calFull.toFixed(4)} · بهبود=${(rawFull - calFull).toFixed(4)}`);

  const oversight =
    verification.freshOutcomesInRegion >= 15 &&
    verification.improved &&
    calFull <= rawFull;
  console.log(`قید نظارتی شورا (≥۱۵ پیامد ناحیه + بهبود holdout + کالیبره≤خام کل): ${oversight ? "سبز" : "قرمز"}`);

  if (!oversight) {
    console.log("نتیجه: نگاشت تازه قید نظارتی را نگذراند — نگاشت کهنه دست‌نخورده می‌ماند (صفر تغییر).");
    process.exit(1);
  }

  const finalMap = { ...map, verification };

  if (!APPLY) {
    console.log("نتیجه: dry-run سبز — برای اعمال: --apply");
    return;
  }

  /* ── ۶) بکاپ کهنه + نوشتن تازه (قانون تثبیت و بقا) ── */
  mkdirSync(BACKUP_DIR, { recursive: true });
  copyFileSync(MAP_PATH, join(BACKUP_DIR, "calibration-map.cal-v1-20261003.json"));
  writeFileSync(MAP_PATH, JSON.stringify(finalMap, null, 2) + "\n");
  console.log(`نوشته شد: ${MAP_PATH} (نسخهٔ ${finalMap.version}) · بکاپ کهنه: ${BACKUP_DIR}`);
}

void main();
