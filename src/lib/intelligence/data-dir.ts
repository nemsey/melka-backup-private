/**
 * data-dir.ts — ریشه‌یابی دایرکتوری دادهٔ مغز ملکا (DIR-FF-TILE-003)
 * ---------------------------------------------------------------------------
 * مسئله: سرور standalone با process.chdir به ‎.next/standalone می‌رود و
 * `process.cwd()/intelligence-data` نیمه‌فrozen/ناقص است (نقشهٔ کالیبراسیون
 * هرگز در باندل standalone نیست — مستثنای outputFileTracing · PN-014/D2).
 * نتیجهٔ زندهٔ پیشین: /api/intelligence/status در تولید بدون کالیبراسیون
 * اجرا می‌شد (Brier خام) در حالی که نقشهٔ مصوب در ریشهٔ ریپو حاضر بود.
 *
 * قرارداد یکسان با قلاب خوددرمانی instrumentation و core-cycle (backups):
 * ریشهٔ مخزن با MELKA_REPO_DIR لنگر می‌شود (پیش‌فرض /home/z/my-project)؛
 * اگر دایرکتوری داده در آن مسیر نبود (تست ایزوله/چک‌اوت دیگر) → همان
 * رفتار پیشینِ نسبی به cwd.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

/** دایرکتوری دادهٔ مغز — ریشهٔ ریپو مقدم بر cwd (عین قرارداد MELKA_REPO_DIR) */
export function intelligenceDataDir(): string {
  const repoRoot = process.env.MELKA_REPO_DIR ?? "/home/z/my-project";
  const p = join(repoRoot, "intelligence-data");
  if (existsSync(p)) return p;
  return join(process.cwd(), "intelligence-data");
}
