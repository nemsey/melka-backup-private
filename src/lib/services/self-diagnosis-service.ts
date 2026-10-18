/**
 * self-diagnosis-service.ts — PN-020/فاز ۱۰ (خودآگاهی — DES10)
 * ---------------------------------------------------------------------------
 * ۲۵ بررسی در پنج دسته (داده ۷ · مدل ۶ · موتور ۵ · امنیت ۴ · حاکمیت ۳) هر
 * ۶ ساعت در Worker (کار diagnosis-cycle) اجرا می‌شود؛ نمرهٔ سلامت موزون ۰-۱۰۰
 * می‌سازد، هشدارها را در AuditLog ثبت می‌کند و گزارش کامل را در جدول پایای
 * DiagnosticReport نگه می‌دارد.
 *
 * قیدهای سخت (DES10 §۱.۲): صفر تغییر دادهٔ تولید (Q1) · صفر کنش بیرونی (Q2) ·
 * شکست یک بررسی چرخه را نمی‌شکند (Q3 — fail-open با نمرهٔ صفر همان بررسی).
 */

import { existsSync, statSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { db } from "@/lib/db";

export const DIAGNOSIS_INTERVAL_H = Number(process.env.MELK_DIAGNOSIS_INTERVAL_H ?? 6);
/** نگه‌داری گزارش‌ها — عین قاعدهٔ حاکمیت تصمیم‌ها (GOV-DECISION) */
export const DIAGNOSIS_RETENTION_DAYS = 90;

export type DiagnosticCategory = "data" | "model" | "engine" | "security" | "governance";

export interface DiagnosticCheckResult {
  checkId: string;
  category: DiagnosticCategory;
  title: string;
  passed: boolean;
  weight: number;
  score: number;
  value: string | null;
  expected: string;
  message: string;
}

export interface DiagnosticAlert {
  checkId: string;
  severity: "critical" | "warning";
  message: string;
}

export interface DiagnosisCycleResult {
  reportId: string;
  healthScore: number;
  passedCount: number;
  total: number;
  alerts: DiagnosticAlert[];
  durationMs: number;
}

/** وزن دسته‌ها — DES10 §۴.۱ (داده ۳۰٪ · مدل ۲۵٪ · موتور ۲۰٪ · امنیت ۱۵٪ · حاکمیت ۱۰٪) */
const CATEGORY_WEIGHTS: Record<DiagnosticCategory, number> = {
  data: 30,
  model: 25,
  engine: 20,
  security: 15,
  governance: 10,
};

/** وزن هر بررسی = وزن دسته ÷ تعداد بررسی دسته */
function weightFor(category: DiagnosticCategory, countInCategory: number): number {
  return Math.round((CATEGORY_WEIGHTS[category] / countInCategory) * 1000) / 1000;
}

const COUNTS: Record<DiagnosticCategory, number> = { data: 7, model: 6, engine: 5, security: 4, governance: 3 };

/** سازندهٔ نتیجهٔ یک بررسی — گذر = score ۱۰۰ (دودویی — DES10 §۴.۲) */
function result(
  checkId: string,
  category: DiagnosticCategory,
  title: string,
  passed: boolean,
  value: string | null,
  expected: string,
  okMessage: string,
  failMessage: string,
): DiagnosticCheckResult {
  return {
    checkId,
    category,
    title,
    passed,
    weight: weightFor(category, COUNTS[category]),
    score: passed ? 100 : 0,
    value,
    expected,
    message: passed ? okMessage : failMessage,
  };
}

/** آستانهٔ بحرانی — این بررسی‌ها شکستشان critical است (نمره نیست؛ هشدار است) */
const CRITICAL_CHECKS = new Set([
  "DIAG-DATA-001", "DIAG-DATA-002", "DIAG-SEC-001", "DIAG-ENGINE-001",
]);

// ═══════════════════════ بررسی‌های دستهٔ داده (۷) ═══════════════════════

export async function checkData(): Promise<DiagnosticCheckResult[]> {
  const out: DiagnosticCheckResult[] = [];
  const DAY = 86_400_000;

  // ۱ — انسجام پایگاه داده
  try {
    // ENGINE: sqlite-only (dbHealth شاخهٔ موتور — سوییچ PN-022-C)
    const r = (await db.$queryRawUnsafe("PRAGMA quick_check")) as { quick_check: string }[];
    const ok = (r[0]?.quick_check ?? "fail") === "ok";
    out.push(result("DIAG-DATA-001", "data", "انسجام پایگاه داده", ok, r[0]?.quick_check ?? null, "quick_check = ok",
      "پایگاه داده سالم است (PRAGMA quick_check = ok).", "پایگاه داده ناسالم است — نیازمند ترمیم ساختاری فوری."));
  } catch (e) {
    out.push(result("DIAG-DATA-001", "data", "انسجام پایگاه داده", false, String(e).slice(0, 80), "quick_check = ok", "", "سنجش انسجام شکست خورد."));
  }

  // ۲ — پوشش داده‌های اصلی
  try {
    const [tx, pr, rq] = await Promise.all([
      db.transactionRecord.count(),
      db.propertyRecord.count(),
      db.requestRecord.count(),
    ]);
    const ok = tx > 0 && pr > 0 && rq > 0;
    out.push(result("DIAG-DATA-002", "data", "پوشش داده‌های اصلی", ok, `tx=${tx} · property=${pr} · request=${rq}`, "هر سه جدول اصلی غیرخالی",
      "هر سه جدول اصلی داده دارند.", "یکی از جداول اصلی خالی است — کش سقوط کرده یا ریست شده."));
  } catch {
    out.push(result("DIAG-DATA-002", "data", "پوشش داده‌های اصلی", false, null, "هر سه جدول اصلی غیرخالی", "", "شمارش جداول شکست خورد."));
  }

  // ۳ — تازگی آخرین همگام‌سازی موفق
  try {
    const st = await db.syncState.findUnique({ where: { id: "singleton" } });
    const last = st?.lastSuccessAt?.getTime() ?? 0;
    const ageH = (Date.now() - last) / 3_600_000;
    const ok = ageH <= 48;
    out.push(result("DIAG-DATA-003", "data", "تازگی آخرین همگام‌سازی", ok, ageH === Infinity ? null : `${Math.round(ageH)} ساعت`, "≤ ۴۸ ساعت",
      `آخرین همگام‌سازی موفق ${Math.round(ageH)} ساعت پیش است.`, `آخرین همگام‌سازی موفق ${Math.round(ageH)} ساعت پیش است (> ۴۸ ساعت) — زنجیرهٔ به‌روزرسانی پایدار نیست.`));
  } catch {
    out.push(result("DIAG-DATA-003", "data", "تازگی آخرین همگام‌سازی", false, null, "≤ ۴۸ ساعت", "", "خواندن SyncState شکست خورد."));
  }

  // ۴ — صفر حذف بدون شاهد بکاپ (عین GOV-DATA-002 — به‌صورت هشدار)
  try {
    const dels = await db.auditLog.findMany({
      where: { operation: "DELETE", action: { not: "DISK_PRUNE" }, createdAt: { gte: new Date(Date.now() - 7 * DAY) } },
      select: { createdAt: true },
    });
    let violations = dels.length;
    if (dels.length > 0) {
      const backups = await db.auditLog.findMany({ where: { action: { contains: "BACKUP" } }, orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } });
      const lastBackup = backups[0]?.createdAt?.getTime() ?? 0;
      violations = dels.filter((d) => d.createdAt.getTime() > lastBackup).length;
    }
    out.push(result("DIAG-DATA-004", "data", "صفر حذف بدون شاهد بکاپ", violations === 0, `${violations} مورد`, "۰ حذف بدون بکاپِ تازه‌تر",
      "همهٔ حذف‌های هفته بکاپِ تازه‌تر دارند.", `${violations} عمل حذف بدون بکاپ تازه‌تر ثبت شده — GOV-DATA-002 (نسخهٔ هشدار).`));
  } catch {
    out.push(result("DIAG-DATA-004", "data", "صفر حذف بدون شاهد بکاپ", false, null, "۰", "", "سنجش حذف/بکاپ شکست خورد."));
  }

  // ۵ — زنده بودن چرخهٔ بکاپ (تازه‌ترین backup-*.db در پوشهٔ backups ≤ ۸ ساعت — چرخهٔ ۶ساعته Worker)
  try {
    const backupsDir = join(process.env.MELKA_REPO_DIR ?? "/home/z/my-project", "backups");
    let newest: number | null = null;
    if (existsSync(backupsDir)) {
      const baks = readdirSync(backupsDir).filter((f) => f.endsWith(".db")).map((f) => statSync(join(backupsDir, f)).mtimeMs);
      newest = baks.length > 0 ? Math.max(...baks) : null;
    }
    const ageH = newest !== null ? (Date.now() - newest) / 3_600_000 : Infinity;
    out.push(result("DIAG-DATA-005", "data", "زنده بودن چرخهٔ بکاپ", ageH <= 8, newest !== null ? `${Math.round(ageH)} ساعت` : null, "بکاپ ≤ ۸ ساعت",
      `آخرین بکاپ چرخشی ${Math.round(ageH)} ساعت پیش ساخته شده.`, `آخرین بکاپ چرخشی ${newest !== null ? Math.round(ageH) : "—"} ساعت پیش است (> ۸) — کار backup-rotation نیمه‌کاره است.`));
  } catch {
    out.push(result("DIAG-DATA-005", "data", "زنده بودن چرخهٔ بکاپ", false, null, "بکاپ ≤ ۸ ساعت", "", "سنجش بکاپ شکست خورد."));
  }

  // ۶ — تناقض جداول مرجع (PN-022-A/مرحلهٔ۱ — I3/DIAG-DATA-006 بازکالیبراسیون ریشه‌ای)
  // ریشه‌یابی زندهٔ PN-022-A: نرخ یتیمِ کد ملک معاملات در برابر کاتالوگ فعال
  // «مستقل از سن معامله» است (۳۰روزه ۵۸٪ · ۹۰روزه ۵۵٪ · کل ۶۰٪) — ARM آگهیِ
  // معامله‌شده را از کاتالوگ فعال حذف می‌کند؛ یتیمیِ تاریخی = گذر زمان، نه شکاف سنک.
  // سنجش معنادارِ مرجع: پوشش غنی‌سازی منبع (TransactionEnrichment از خود ARM —
  // هر معامله با شناسهٔ معتبر در trade-overviews) ≥ ۹۵٪ = پیوند سالم.
  try {
    const [txTotal, txEnriched] = await Promise.all([
      db.transactionRecord.count(),
      db.transactionEnrichment.count(),
    ]);
    const coverage = txTotal > 0 ? Math.round((txEnriched / txTotal) * 100) : 100;
    // شاهد اطلاعاتی (نه شرط قبول/رد): نرخ یتیم کاتالوگ فعال — عمداً گزارش می‌شود
    const sample = await db.transactionRecord.findMany({ take: 200, select: { propertyCode: true } });
    const codes = [...new Set(sample.map((s) => s.propertyCode).filter(Boolean))];
    const known = await db.propertyRecord.count({ where: { propertyCode: { in: codes } } });
    const catalogOrphanPct = codes.length > 0 ? Math.round(((codes.length - known) / codes.length) * 100) : 0;
    out.push(result("DIAG-DATA-006", "data", "تناقض جداول مرجع", coverage >= 95, `${coverage}٪ پوشش منبع (یتیم کاتالوگ ${catalogOrphanPct}٪ اطلاعاتی)`, "پوشش غنی‌سازی ≥ ۹۵٪",
      `پیوند معاملات↔منبع ARM سالم است: ${txEnriched}/${txTotal} معامله شناسهٔ معتبر منبع دارند (یتیم کاتالوگ فعال ${catalogOrphanPct}٪ — طبیعی: ARM آگهی معامله‌شده را از فهرست فعال حذف می‌کند).`,
      `فقط ${coverage}٪ معاملات شناسهٔ معتبر در منبع ARM دارند (< ۹۵٪) — reindex غنی‌سازی لازم است.`));
  } catch {
    out.push(result("DIAG-DATA-006", "data", "تناقض جداول مرجع", false, null, "پوشش ≥ ۹۵٪", "", "سنجش تناقض شکست خورد."));
  }

  // ۷ — حجم رشد پایگاه داده (مقایسهٔ بی‌وضعیت با تازه‌ترین بکاپ چرخشی — بدون ذخیرهٔ وضعیت)
  try {
    const root = process.env.MELKA_REPO_DIR ?? "/home/z/my-project";
    const dbPath = join(root, "db/custom.db");
    const sizeMB = existsSync(dbPath) ? Math.round(statSync(dbPath).size / 1048576) : null;
    let growth: number | null = null;
    const backupsDir = join(root, "backups");
    if (existsSync(backupsDir)) {
      const baks = readdirSync(backupsDir).filter((f) => f.endsWith(".db")).map((f) => ({ f, m: statSync(join(backupsDir, f)).mtimeMs })).sort((a, b) => b.m - a.m);
      if (baks.length > 0 && sizeMB !== null) {
        const bakMB = Math.round(statSync(join(backupsDir, baks[0]!.f)).size / 1048576);
        growth = sizeMB - bakMB;
      }
    }
    const ok = sizeMB !== null && (growth !== null ? growth < 50 : sizeMB < 600);
    out.push(result("DIAG-DATA-007", "data", "حجم رشد پایگاه داده", ok,
      sizeMB !== null ? `${sizeMB}MB${growth !== null ? ` (رشد ${growth >= 0 ? "+" : ""}${growth}MB از آخرین بکاپ)` : ""}` : null,
      "رشد < ۵۰MB از آخرین بکاپ",
      `پایگاه داده ${sizeMB}MB — رشد از آخرین بکاپ ${growth ?? "؟"}MB.`,
      growth !== null && growth >= 50
        ? `رشد ${growth}MB از آخرین بکاپ (> ۵۰MB) — بررسی نشتی داده یا بکاپ انباشته لازم است.`
        : `پایگاه داده ${sizeMB}MB از آستانهٔ مطلق (۶۰۰MB) عبور کرده — بررسی حجم لازم است.`));
  } catch {
    out.push(result("DIAG-DATA-007", "data", "حجم رشد پایگاه داده", false, null, "رشد < ۵۰MB", "", "سنجش حجم شکست خورد."));
  }

  return out;
}

// ═══════════════════════ بررسی‌های دستهٔ مدل (۶) ═══════════════════════

export async function checkModel(): Promise<DiagnosticCheckResult[]> {
  const out: DiagnosticCheckResult[] = [];
  const DAY = 86_400_000;

  const champion = await db.modelVersion.findFirst({ where: { status: "champion" } }).catch(() => null);
  out.push(result("DIAG-MODEL-001", "model", "وجود مدل قهرمان", champion !== null, champion ? champion.modelId : null, "حداقل یک champion",
    champion ? `قهرمان فعال: ${champion.modelId} v${champion.version}` : "", "هیچ مدل قهرمانی فعال نیست — مغز بدون نسخهٔ رسمی است."));

  // ۲ — Brier قهرمان (آخرین ارزیابی از ModelVersion)
  const brier = champion?.brierScore ?? null;
  if (champion && brier !== null) {
    try {
      out.push(result("DIAG-MODEL-002", "model", "Brier قهرمان در بازه", brier < 0.3, String(brier), "< ۰٫۳",
        `Brier قهرمان ${brier} است — در بازهٔ پروژه.`, `Brier قهرمان ${brier} ≥ ۰٫۳ — کیفیت پیش‌بینی سقوط کرده.`));
    } catch {
      out.push(result("DIAG-MODEL-002", "model", "Brier قهرمان در بازه", false, null, "< ۰٫۳", "", "خواندن Brier شکست خورد."));
    }
  } else {
    out.push(result("DIAG-MODEL-002", "model", "Brier قهرمان در بازه", false, null, "< ۰٫۳", "", "قهرمان امتیاز Brier ثبت‌شده ندارد."));
  }

  // ۳ — کالیبراسیون (از predictions-live.jsonl نمی‌خوانیم — سبک: DriftCheck آخرین performance)
  const lastPerf = await db.driftCheck.findFirst({ where: { driftType: "performance" }, orderBy: { checkedAt: "desc" } }).catch(() => null);
  const perfVal = lastPerf?.magnitude ?? null;
  out.push(result("DIAG-MODEL-003", "model", "کالیبراسیون قهرمان", perfVal !== null && perfVal < 0.2, perfVal !== null ? String(perfVal) : null, "رانش عملکرد < ۰٫۲",
    perfVal !== null ? `رانش عملکرد آخرین سنجش ${perfVal} — کالیبراسیون قابل‌قبول.` : "بدون سابقهٔ سنجش عملکرد.",
    `رانش عملکرد ${perfVal} ≥ ۰٫۲ — کالیبراسیون مدل از واقعیت فاصله گرفته.`));

  // ۴ — رانش سه‌گانه زیر آستانه
  try {
    const latest = await db.driftCheck.findMany({ orderBy: { checkedAt: "desc" }, take: 12 });
    const byType = new Map<string, number>();
    for (const d of latest) if (!byType.has(d.driftType)) byType.set(d.driftType, d.magnitude);
    const allPresent = byType.size >= 3;
    const maxScore = allPresent ? Math.max(...byType.values()) : null;
    out.push(result("DIAG-MODEL-004", "model", "رانش سه‌گانه زیر آستانه", allPresent && (maxScore ?? 1) < 0.05, maxScore !== null ? String(maxScore) : null, "هر سه نوع < ۰٫۰۵",
      allPresent ? `بیشترین رانش ${maxScore} — زیر آستانهٔ retrain.` : "رانش سه‌گانه کامل ثبت نشده.",
      allPresent ? `بیشترین رانش ${maxScore} ≥ ۰٫۰۵ — آستانهٔ آموزش مجدد رد شد.` : "رانش سه‌گانه کامل ثبت نشده — کار drift-guard ناقص است."));
  } catch {
    out.push(result("DIAG-MODEL-004", "model", "رانش سه‌گانه زیر آستانه", false, null, "هر سه < ۰٫۰۵", "", "سنجش رانش شکست خورد."));
  }

  // ۵ — نسخه فعال مهر خورده در تصمیم‌های تازه
  try {
    const recent = await db.decisionRecord.findFirst({ where: { createdAt: { gte: new Date(Date.now() - 7 * DAY) }, modelVersionId: { not: null } } });
    out.push(result("DIAG-MODEL-005", "model", "نسخه فعال مهر خورده", recent !== null, recent?.modelVersionId ?? null, "تصمیم تازه با مهر قهرمان",
      "تصمیم‌های تازه با modelVersionId قهرمان مهر خورده‌اند.", "در ۷ روز اخیر هیچ تصمیمی با مهر نسخهٔ قهرمان ثبت نشده — حلقهٔ تصمیم ساکن است."));
  } catch {
    out.push(result("DIAG-MODEL-005", "model", "نسخه فعال مهر خورده", false, null, "تصمیم تازه با مهر قهرمان", "", "سنجش مهر تصمیم شکست خورد."));
  }

  // ۶ — سایهٔ تصمیم فعال (کار ۶ساعته — سقف ۱۲ ساعت)
  try {
    const last = await db.shadowDecisionRun.findFirst({ orderBy: { ranAt: "desc" } });
    const ageH = last ? (Date.now() - last.ranAt.getTime()) / 3_600_000 : Infinity;
    out.push(result("DIAG-MODEL-006", "model", "سایهٔ تصمیم فعال", ageH <= 12, last ? `${Math.round(ageH)} ساعت` : null, "≤ ۱۲ ساعت",
      `آخرین اجرای سایه ${Math.round(ageH)} ساعت پیش.`, `آخرین اجرای سایه ${last ? Math.round(ageH) : "—"} ساعت پیش (> ۱۲) — کار decision-shadow نیمه‌کاره است.`));
  } catch {
    out.push(result("DIAG-MODEL-006", "model", "سایهٔ تصمیم فعال", false, null, "≤ ۱۲ ساعت", "", "سنجش سایه شکست خورد."));
  }

  return out;
}

// ═══════════════════════ بررسی‌های دستهٔ موتور (۵) ═══════════════════════

export async function checkEngine(): Promise<DiagnosticCheckResult[]> {
  const out: DiagnosticCheckResult[] = [];

  // ۱ — موتورهای مغز زنده (رجیستری ایجنت ≥ ۱۱ موتور — خط پایهٔ تاریخی؛ فعلی ۱۵)
  try {
    const { listAgents } = await import("@/core/agent");
    const agents = listAgents();
    out.push(result("DIAG-ENGINE-001", "engine", "موتورهای مغز زنده", agents.length >= 11, `${agents.length} موتور`, "≥ ۱۱ موتور",
      `${agents.length} ایجنت/موتور هوشمند در رجیستری حاضرند.`, `فقط ${agents.length} موتور در رجیستری حاضر است (< ۱۱) — موتوری از مد افتاده.`));
  } catch {
    out.push(result("DIAG-ENGINE-001", "engine", "موتورهای مغز زنده", false, null, "≥ ۱۱ موتور", "", "خواندن رجیستری ایجنت‌ها شکست خورد."));
  }

  // ۲ — تازگی حلقهٔ هوش (مهر ranAt فایل loop-latest ≤ ۲ ساعت — چرخهٔ ۶۰دقیقه‌ای)
  try {
    const loopPath = join(process.env.MELKA_REPO_DIR ?? "/home/z/my-project", "intelligence-data/loop-latest.json");
    const loop = existsSync(loopPath) ? (JSON.parse(readFileSync(loopPath, "utf8")) as { ranAt?: string }) : null;
    const ageH = loop?.ranAt ? (Date.now() - new Date(loop.ranAt).getTime()) / 3_600_000 : Infinity;
    out.push(result("DIAG-ENGINE-002", "engine", "تازگی حلقهٔ هوش", ageH <= 2, loop?.ranAt ?? null, "مهر ≤ ۲ ساعت",
      `آخرین حلقهٔ مغز ${Math.round(ageH)} ساعت پیش.`, `آخرین حلقهٔ مغز ${loop?.ranAt ? Math.round(ageH) : "—"} ساعت پیش (> ۲) — مغز خواب است.`));
  } catch {
    out.push(result("DIAG-ENGINE-002", "engine", "تازگی حلقهٔ هوش", false, null, "مهر ≤ ۲ ساعت", "", "خواندن مهر حلقه شکست خورد."));
  }

  // ۳ — صفر خطای متوالی موتور (هیچ کارِ Worker با status=failed باقی نمانده)
  try {
    const failed = await db.syncJobState.findMany({ where: { status: "failed" }, select: { jobId: true } });
    out.push(result("DIAG-ENGINE-003", "engine", "صفر خطای متوالی موتور", failed.length === 0, failed.length ? failed.map((f) => f.jobId).join(",") : "صفر", "هیچ کار failed",
      "هیچ کار Worker در وضعیت شکست باقی نمانده.", `${failed.length} کار در وضعیت failed: ${failed.map((f) => f.jobId).join("، ")} — موتورها دچار اختلال‌اند.`));
  } catch {
    out.push(result("DIAG-ENGINE-003", "engine", "صفر خطای متوالی موتور", false, null, "هیچ", "", "سنجش کارها شکست خورد."));
  }

  // ۴ — Tier یادگیری معتبر (آخرین تصمیم مغز با tier در {۰,۱,۲,۳})
  try {
    const last = await db.decisionRecord.findFirst({ orderBy: { createdAt: "desc" }, select: { tierAtCreation: true } });
    const tier = last?.tierAtCreation ?? null;
    const valid = tier !== null && [0, 1, 2, 3].includes(tier);
    out.push(result("DIAG-ENGINE-004", "engine", "Tier یادگیری معتبر", valid, tier !== null ? String(tier) : null, "tier در {۰,۱,۲,۳}",
      `Tier فعلی یادگیری: ${tier}.`, `Tier یادگیری نامعتبر است (${tier ?? "بدون تصمیم"}) — وضعیت مغز نامشخص.`));
  } catch {
    out.push(result("DIAG-ENGINE-004", "engine", "Tier یادگیری معتبر", false, null, "tier در {۰,۱,۲,۳}", "", "سنجش tier شکست خورد."));
  }

  // ۵ — کارهای حساس Worker زنده (دو کار آخر هرکدام در ۲ چرخهٔ اخیر done/سبک: مهر updatedAt)
  try {
    const catalog = await db.syncJobState.findUnique({ where: { jobId: "catalog-listings" } });
    const staleMs = 24 * 3_600_000; // کار ۱دقیقه‌ای نباید >۲۴ ساعت بی‌مهر بماند
    const ok = catalog ? Date.now() - catalog.updatedAt.getTime() < staleMs : false;
    out.push(result("DIAG-ENGINE-005", "engine", "کارهای Worker زنده", ok, catalog?.updatedAt.toISOString() ?? null, "مهر کار کاتالوگ < ۲۴ ساعت",
      `کار پایدارساز بروزرسانی زنده است (آخرین مهر ${catalog?.updatedAt.toISOString().slice(0, 16) ?? "—"}).`,
      "کار پایدارساز بروزرسانی بیش از ۲۴ ساعت مهر نخورده — Worker ممکن است مرده باشد."));
  } catch {
    out.push(result("DIAG-ENGINE-005", "engine", "کارهای Worker زنده", false, null, "مهر < ۲۴ ساعت", "", "سنجش Worker شکست خورد."));
  }

  return out;
}

// ═══════════════════ بررسی‌های دستهٔ امنیت (۴) ═══════════════════

export async function checkSecurity(): Promise<DiagnosticCheckResult[]> {
  const out: DiagnosticCheckResult[] = [];
  const HOUR = 3_600_000;

  // ۱ — سیاههٔ حسابرسی زنده (رد در ۶ ساعت اخیر)
  try {
    const recent = await db.auditLog.findFirst({ where: { createdAt: { gte: new Date(Date.now() - 6 * HOUR) } }, select: { createdAt: true } });
    out.push(result("DIAG-SEC-001", "security", "سیاههٔ حسابرسی زنده", recent !== null, recent?.createdAt.toISOString() ?? null, "رد AuditLog در ۶ ساعت اخیر",
      "سیاههٔ حسابرسی فعال است — ردهای تازه ثبت می‌شوند.", "سیاههٔ حسابرسی ۶ ساعت است ساکت است — یا ترافیک صفر یا ثبت رد دچار اختلال."));
  } catch {
    out.push(result("DIAG-SEC-001", "security", "سیاههٔ حسابرسی زنده", false, null, "رد در ۶ ساعت", "", "سنجش سیاهه شکست خورد."));
  }

  // ۲ — صفر دسترسی غیرمجاز متمادی (≥۵ رد متوالی یک کد — از AuditLog با action=ACCESS_DENIED)
  // PN-022-A/مرحلهٔ۱ (I7): ردهای «تحلیل‌شده» (با سند ACCESS_DENIED_ADJUDICATED) مستثنا
  // هستند — چرخهٔ امنیتی: کشف → تحلیل → صدور حکم مستند → پایش تازه.
  // ردهای پیش از آخرین حکمِ همان کد، بسته تلقی می‌شوند (نه حذف — شواهد ماندگارند).
  try {
    const denies = await db.auditLog.findMany({ where: { action: "ACCESS_DENIED" }, orderBy: { createdAt: "desc" }, take: 40, select: { actor: true, createdAt: true } });
    const adjudications = await db.auditLog.findMany({ where: { action: "ACCESS_DENIED_ADJUDICATED" }, orderBy: { createdAt: "desc" }, take: 40, select: { actor: true, createdAt: true } });
    const lastAdjudicatedAt = new Map<string, number>();
    for (const a of adjudications) {
      if (a.actor && !lastAdjudicatedAt.has(a.actor)) lastAdjudicatedAt.set(a.actor, a.createdAt.getTime());
    }
    const open = denies.filter((d) => d.actor && (d.createdAt.getTime() > (lastAdjudicatedAt.get(d.actor) ?? 0)));
    let streak = 0;
    let streakCode: string | null = null;
    for (const d of open) {
      if (streakCode === null || streakCode === d.actor) {
        streak += 1;
        streakCode = d.actor;
        if (streak >= 5) break;
      } else {
        streak = 1;
        streakCode = d.actor;
      }
    }
    out.push(result("DIAG-SEC-002", "security", "صفر دسترسی غیرمجاز متمادی", streak < 5, `${streak} رد متوالی باز (از ${denies.length} رد — ${denies.length - open.length} تحلیل‌شده)`, "< ۵ رد متوالی باز",
      "الگوی تلاش غیرمجاز متمادیِ باز دیده نمی‌شود.", `${streak} رد متوالی دسترسی غیرمجاز از یک کد (${streakCode}) — احتمال تلاش نفوذ یا خطای کلاینت.`));
  } catch {
    out.push(result("DIAG-SEC-002", "security", "صفر دسترسی غیرمجاز متمادی", false, null, "< ۵", "", "سنجش دسترسی شکست خورد."));
  }

  // ۳ — صفر LLM در مسیر تولید (هیچ کلید سرویس مدل زبانی در محیط فعال نیست — گارد CI نیز سورس را می‌سنجد)
  try {
    const llmKeyNames = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "GOOGLE_AI_API_KEY", "ZAI_API_KEY", "Z_AI_API_KEY", "OPENROUTER_API_KEY"];
    const active = llmKeyNames.filter((k) => Boolean(process.env[k]));
    out.push(result("DIAG-SEC-003", "security", "صفر LLM در مسیر تولید", active.length === 0, active.length ? active.join(",") : "صفر", "هیچ کلید LLM فعال",
      "هیچ کلید سرویس مدل زبانی در محیط تولید فعال نیست — مرز هوش مصنوعی برقرار.", `کلیدهای LLM فعال در محیط: ${active.join("، ")} — نقض مرز هوش مصنوعی تولید.`));
  } catch {
    out.push(result("DIAG-SEC-003", "security", "صفر LLM در مسیر تولید", false, null, "صفر کلید", "", "سنجش کلیدها شکست خورد."));
  }

  // ۴ — نشست‌های فعال OWNER سالم (≤ ۳ نشست منقضی‌نشده)
  try {
    const sessions = await db.session.count({ where: { revoked: false, expiresAt: { gt: new Date() }, role: "OWNER" } });
    out.push(result("DIAG-SEC-004", "security", "نشست‌های فعال OWNER سالم", sessions <= 3, `${sessions} نشست OWNER فعال`, "≤ ۳",
      `${sessions} نشست OWNER فعال — طبیعی.`, `${sessions} نشست OWNER فعال (> ۳) — بستن نشست‌های اضافی لازم است.`));
  } catch {
    out.push(result("DIAG-SEC-004", "security", "نشست‌های فعال OWNER سالم", false, null, "≤ ۳", "", "سنجش نشست‌ها شکست خورد."));
  }

  return out;
}

// ═══════════ بررسی‌های دستهٔ حاکمیت (۳) ═══════════

export async function checkGovernance(): Promise<DiagnosticCheckResult[]> {
  const out: DiagnosticCheckResult[] = [];

  // ۱ — بررسی ۱۵قاعده‌ای پاس (آخرین گزارش با failed=0)
  try {
    const last = await db.governanceCheckRecord.findFirst({ orderBy: { checkedAt: "desc" } });
    out.push(result("DIAG-GOV-001", "governance", "بررسی ۱۵قاعده‌ای پاس", last !== null && last.failed === 0, last ? `failed=${last.failed}` : null, "آخرین بررسی با failed=0",
      "آخرین بررسی حاکمیت کامل سبز است.", `آخرین بررسی حاکمیت ${last?.failed ?? "—"} قاعده قرمز دارد.`));
  } catch {
    out.push(result("DIAG-GOV-001", "governance", "بررسی ۱۵قاعده‌ای پاس", false, null, "failed=0", "", "سنجش حاکمیت شکست خورد."));
  }

  // ۲ — صفر نقض بحرانی باز
  try {
    const last = await db.governanceCheckRecord.findFirst({ orderBy: { checkedAt: "desc" } });
    let criticals: string[] = [];
    if (last?.criticalViolationsJson) {
      try {
        criticals = JSON.parse(last.criticalViolationsJson) as string[];
      } catch {
        criticals = [];
      }
    }
    out.push(result("DIAG-GOV-002", "governance", "صفر نقض بحرانی باز", criticals.length === 0, criticals.length ? criticals.join(",") : "صفر", "criticalViolations = []",
      "هیچ نقض بحرانی حاکمیتی باز نیست.", `${criticals.length} نقض بحرانی باز: ${criticals.join("، ")} — گیت enforce ممکن است ۵۰۳ بدهد.`));
  } catch {
    out.push(result("DIAG-GOV-002", "governance", "صفر نقض بحرانی باز", false, null, "[]", "", "سنجش نقض بحرانی شکست خورد."));
  }

  // ۳ — ارزیابی ۹۰روزه به‌روز (≤ ۹۵ روز)
  try {
    const last = await db.policyEvaluationRecord.findFirst({ orderBy: { evaluatedAt: "desc" } });
    const ageDays = last ? (Date.now() - last.evaluatedAt.getTime()) / 86_400_000 : Infinity;
    out.push(result("DIAG-GOV-003", "governance", "ارزیابی ۹۰روزه به‌روز", ageDays <= 95, last ? `${Math.round(ageDays)} روز` : null, "≤ ۹۵ روز",
      `آخرین ارزیابی سیاست ${Math.round(ageDays)} روز پیش.`, `آخرین ارزیابی سیاست ${last ? Math.round(ageDays) : "—"} روز پیش (> ۹۵) — کار policy-eval عقب افتاده.`));
  } catch {
    out.push(result("DIAG-GOV-003", "governance", "ارزیابی ۹۰روزه به‌روز", false, null, "≤ ۹۵ روز", "", "سنجش ارزیابی شکست خورد."));
  }

  return out;
}

// ═══════════════════════ چرخهٔ کامل تشخیص ═══════════════════════

/** نگاشت بررسی‌های قابل‌ترمیم به کنش فاز ۱۱ (DES11 §۷) */
export const REPAIR_CANDIDATES: Readonly<Record<string, string>> = {
  "DIAG-DATA-003": "custom",           // زنجیرهٔ همگام‌سازی — راه‌اندازی دستی/بررسی
  "DIAG-DATA-005": "custom",           // بکاپ — اجرای چرخهٔ بکاپ
  "DIAG-DATA-006": "reindex",          // پیوند جداول — بازنمونه‌گیری
  "DIAG-DATA-007": "prune_sessions",   // رشد غیرطبیعی — هرس
  "DIAG-MODEL-002": "recalibrate",     // Brier بد — بازکالیبراسیون
  "DIAG-MODEL-003": "recalibrate",     // کالیبراسیون — بازکالیبراسیون
  "DIAG-MODEL-004": "retrain",         // رانش — آموزش مجدد (با شورا)
  "DIAG-ENGINE-001": "custom",         // موتور از مد رفته — راه‌اندازی
  "DIAG-ENGINE-002": "custom",         // مغز خواب — چرخهٔ هوش
  "DIAG-ENGINE-003": "custom",         // خطای متوالی — بررسی لاگ
  "DIAG-ENGINE-004": "update_threshold", // tier نامعتبر — تنظیم
  "DIAG-ENGINE-005": "custom",         // Worker — بررسی
  "DIAG-SEC-002": "custom",           // تلاش نفوذ — بستن/بررسی
  "DIAG-SEC-003": "custom",            // گارد LLM — اجرای CI
  "DIAG-SEC-004": "prune_sessions",    // نشست زیاد — هرس
  "DIAG-GOV-003": "custom",            // ارزیابی عقب‌افتاده — اجرا
};

/** اجرای چرخهٔ کامل تشخیص — ثبت گزارش پایا + هشدارها */
export async function runDiagnosisCycle(triggerSource: "worker" | "manual" = "worker"): Promise<DiagnosisCycleResult> {
  const t0 = Date.now();
  // Q3 — شکست هر دسته کل چرخه را نمی‌شکند
  const [data, model, engine, security, governance] = await Promise.all([
    checkData().catch(() => [] as DiagnosticCheckResult[]),
    checkModel().catch(() => [] as DiagnosticCheckResult[]),
    checkEngine().catch(() => [] as DiagnosticCheckResult[]),
    checkSecurity().catch(() => [] as DiagnosticCheckResult[]),
    checkGovernance().catch(() => [] as DiagnosticCheckResult[]),
  ]);
  const checks = [...data, ...model, ...engine, ...security, ...governance];

  // نمرهٔ موزون — DES10 §۴.۲
  const totalWeight = checks.reduce((s, c) => s + c.weight, 0);
  const healthScore = totalWeight > 0 ? Math.round(checks.reduce((s, c) => s + c.score * c.weight, 0) / totalWeight) : 0;
  const passedCount = checks.filter((c) => c.passed).length;

  const alerts: DiagnosticAlert[] = checks
    .filter((c) => !c.passed)
    .map((c) => ({
      checkId: c.checkId,
      severity: CRITICAL_CHECKS.has(c.checkId) ? ("critical" as const) : ("warning" as const),
      message: `[${c.checkId}] ${c.title}: ${c.message}`,
    }));

  const row = await db.diagnosticReport.create({
    data: {
      healthScore,
      passedCount,
      alertsJson: JSON.stringify(alerts),
      checksJson: JSON.stringify(checks),
      triggerSource,
      durationMs: Date.now() - t0,
    },
  });

  // هشدارها در AuditLog (تکرار تا رفع — طبیعی) + نمرهٔ قرمز = INFRA_ALERT فوری
  for (const a of alerts) {
    await db.auditLog
      .create({
        data: {
          action: a.severity === "critical" ? "DIAGNOSIS_CRITICAL_ALERT" : "DIAGNOSIS_ALERT",
          actor: "self-diagnosis",
          detail: a.message,
          operation: "READ",
          entityType: "infra",
          recordCount: 1,
          accessScope: "OWNER",
        },
      })
      .catch(() => undefined);
  }
  if (healthScore < 50) {
    await db.auditLog
      .create({
        data: {
          action: "INFRA_ALERT",
          actor: "self-diagnosis",
          detail: `نمرهٔ سلامت سامانه ${healthScore}/۱۰۰ است (< ۵۰) — ${passedCount}/${checks.length} بررسی پاس. هشدار فوری مالک (DES10 §۴.۳).`,
          operation: "READ",
          entityType: "infra",
          recordCount: 1,
          accessScope: "OWNER",
        },
      })
      .catch(() => undefined);
  }

  // جاروب نرم ۹۰روزه — فقط رکوردهای خودِ تشخیص (دکترین دادهٔ مقدس برای بقیه)
  const cutoff = new Date(Date.now() - DIAGNOSIS_RETENTION_DAYS * 86_400_000);
  await db.diagnosticReport.deleteMany({ where: { createdAt: { lt: cutoff } } }).catch(() => undefined);

  return {
    reportId: row.id,
    healthScore,
    passedCount,
    total: checks.length,
    alerts,
    durationMs: row.durationMs,
  };
}

/** آخرین گزارش + خلاصهٔ هفت اجرای اخیر (برای روت OWNER) */
export async function getLatestDiagnosis(): Promise<{
  latest: {
    id: string; healthScore: number; passedCount: number; total: number; alerts: DiagnosticAlert[];
    checks: DiagnosticCheckResult[]; triggerSource: string; durationMs: number; createdAt: string;
  } | null;
  recent: { healthScore: number; passedCount: number; createdAt: string }[];
  repairCandidates: { checkId: string; suggestedAction: string }[];
}> {
  const latest = await db.diagnosticReport.findFirst({ orderBy: { createdAt: "desc" } });
  const recent = await db.diagnosticReport.findMany({ orderBy: { createdAt: "desc" }, take: 7, select: { healthScore: true, passedCount: true, createdAt: true } });
  if (!latest) return { latest: null, recent: [], repairCandidates: [] };
  const alerts = JSON.parse(latest.alertsJson) as DiagnosticAlert[];
  const checks = JSON.parse(latest.checksJson) as DiagnosticCheckResult[];
  const repairCandidates = checks
    .filter((c) => !c.passed && REPAIR_CANDIDATES[c.checkId])
    .map((c) => ({ checkId: c.checkId, suggestedAction: REPAIR_CANDIDATES[c.checkId]! }));
  return {
    latest: {
      id: latest.id,
      healthScore: latest.healthScore,
      passedCount: latest.passedCount,
      total: checks.length,
      alerts,
      checks,
      triggerSource: latest.triggerSource,
      durationMs: latest.durationMs,
      createdAt: latest.createdAt.toISOString(),
    },
    recent: recent.map((r) => ({ healthScore: r.healthScore, passedCount: r.passedCount, createdAt: r.createdAt.toISOString() })),
    repairCandidates,
  };
}
