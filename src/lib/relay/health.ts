/**
 * سازندهٔ سلامت رله (PN-038 · فاز ۴ · بند ۴.۱ — شورا-ن۰۶۳)
 * ---------------------------------------------------------------------------
 * «Job relay-health-check (۳ لایه: Heartbeat، API Probe، Full Sync)»
 *
 * سه لایه:
 *   ۱) Heartbeat — نبض گوشی: آخرین lastSeenAt دستگاه فعال (پنجرهٔ ۱۵ دقیقه)
 *   ۲) API Probe — فعالیت صف: اقلام done در ۳۰ دقیقهٔ اخیر + نرخ موفقیت
 *   ۳) Full Sync — تازگی داده: جدیدترین updatedAt آگهی/درخواست (۲۴ ساعت)
 *      + تازگی بکاپ مقدس (sacred-backups.json)
 *
 * حکم: 🟢 همهٔ لایه‌ها سبز · 🟡 یک لایه کهنه · 🔴 نبض مرده + صف ساکت
 *
 * مصرف‌کنندگان: کار Worker (هر ۵ دقیقه + شاهد AuditLog) · روت GET /api/relay/health
 */

import { db } from "@/lib/db";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = process.env.MELKA_REPO_DIR ?? "/home/z/my-project";

export interface RelayHealthLayer {
  key: "heartbeat" | "api-probe" | "full-sync";
  label: string;
  state: "green" | "yellow" | "red";
  detail: string;
  measuredAt: string;
}

export interface RelayHealthReport {
  verdict: "green" | "yellow" | "red";
  verdictFa: string;
  layers: RelayHealthLayer[];
  computedAt: string;
}

const HEARTBEAT_WINDOW_MS = 15 * 60_000;   // نبض گوشی: ۱۵ دقیقه
const ACTIVITY_WINDOW_MS = 30 * 60_000;    // فعالیت صف: ۳۰ دقیقه
const DATA_FRESH_WINDOW_MS = 24 * 60 * 60_000; // تازگی داده: ۲۴ ساعت
const BACKUP_FRESH_WINDOW_MS = 2 * 60 * 60_000; // بکاپ مقدس: ۲ ساعت (۸×۱۵د)

function agoFa(ms: number): string {
  const m = Math.round(ms / 60_000);
  if (m < 1) return "همین حالا";
  if (m < 60) return `${m} دقیقه پیش`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} ساعت پیش`;
  return `${Math.round(h / 24)} روز پیش`;
}

/**
 * اجرأ کار Worker پایش رله (PN-038/۴.۱) — گزارش + شاهد AuditLog + فایل.
 * برای تست مستقیم هم صادر می‌شود (worker خودش همین را با db صدا می‌زند).
 */
export async function runRelayHealthCheckJob(): Promise<RelayHealthReport | null> {
  try {
    const report = await computeRelayHealth();
    try {
      const { writeFileSync, mkdirSync } = await import("node:fs");
      mkdirSync(join(REPO_ROOT, "upload/.runtime"), { recursive: true });
      writeFileSync(join(REPO_ROOT, "upload/.runtime/relay-health.json"), JSON.stringify(report, null, 2));
    } catch { /* شاهد بهترین-تلاش */ }
    await db.auditLog
      .create({
        data: {
          action: "RELAY_HEALTH",
          actor: "worker:relay-health-check",
          detail: JSON.stringify({ verdict: report.verdict, layers: report.layers.map((l) => ({ key: l.key, state: l.state })) }),
        },
      })
      .catch(() => undefined);
    return report;
  } catch {
    return null;
  }
}

export async function computeRelayHealth(): Promise<RelayHealthReport> {
  const now = Date.now();
  const layers: RelayHealthLayer[] = [];

  // ── لایهٔ ۱: نبض گوشی ──
  try {
    const active = await db.relayDevice.findFirst({
      where: { revokedAt: null, lastSeenAt: { not: null } },
      orderBy: { lastSeenAt: "desc" },
      select: { deviceId: true, lastSeenAt: true },
    });
    // نبض واقعی: جدیدترین فعالیت صف (تکمیل/دریافت کار) — lastSeenAt فقط در بوت
    // دستگاه تازه می‌شود (درس پایش: گوشی هر چرخه نتیجه می‌فرستد ولی ردیف دستگاه
    // را بازنویسی نمی‌کند — سرچشمهٔ حقیقت همین completedAt/dispatchedAt است).
    const lastQueueActivity = await db.relayQueue.findFirst({
      where: { completedAt: { not: null } },
      orderBy: { completedAt: "desc" },
      select: { completedAt: true },
    });
    const lastDispatch = await db.relayQueue.findFirst({
      where: { dispatchedAt: { not: null } },
      orderBy: { dispatchedAt: "desc" },
      select: { dispatchedAt: true },
    });
    const candidates = [
      active?.lastSeenAt?.getTime() ?? 0,
      lastQueueActivity?.completedAt?.getTime() ?? 0,
      lastDispatch?.dispatchedAt?.getTime() ?? 0,
    ];
    const lastSeen = Math.max(...candidates);
    const age = now - lastSeen;
    const state: "green" | "yellow" | "red" = lastSeen === 0 ? "red" : age <= HEARTBEAT_WINDOW_MS ? "green" : age <= 6 * 60 * 60_000 ? "yellow" : "red";
    layers.push({
      key: "heartbeat",
      label: "نبض گوشی رله",
      state,
      detail: lastSeen === 0 ? "هیچ دستگاه فعالی دیده نشده است" : `آخرین نبض ${agoFa(age)}`,
      measuredAt: new Date().toISOString(),
    });
  } catch {
    layers.push({ key: "heartbeat", label: "نبض گوشی رله", state: "red", detail: "خطا در خواندن وضعیت دستگاه‌ها", measuredAt: new Date().toISOString() });
  }

  // ── لایهٔ ۲: فعالیت صف (API Probe) ──
  try {
    const since = new Date(now - ACTIVITY_WINDOW_MS);
    const [done, failed, dispatched, pending] = await Promise.all([
      db.relayQueue.count({ where: { status: "done", enqueuedAt: { gt: since } } }),
      db.relayQueue.count({ where: { status: "failed", enqueuedAt: { gt: since } } }),
      db.relayQueue.count({ where: { status: "dispatched" } }),
      db.relayQueue.count({ where: { status: "pending" } }),
    ]);
    const total = done + failed;
    const successRate = total > 0 ? done / total : null;
    const state: "green" | "yellow" | "red" =
      done > 0 && (successRate === null || successRate >= 0.6) ? "green" : done > 0 ? "yellow" : pending + dispatched > 0 ? "yellow" : "red";
    layers.push({
      key: "api-probe",
      label: "فعالیت مسیر رله",
      state,
      detail:
        done > 0
          ? `${done} کار موفق در ۳۰ دقیقه${failed > 0 ? ` · ${failed} ناموفق` : ""}${successRate !== null ? ` · موفقیت ${Math.round(successRate * 100)}٪` : ""}`
          : pending + dispatched > 0
            ? `صف کار دارد (${pending + dispatched} در انتظار) اما پاسخی در ۳۰ دقیقه نرسیده`
            : "صف در ۳۰ دقیقهٔ اخیر ساکت بوده است",
      measuredAt: new Date().toISOString(),
    });
  } catch {
    layers.push({ key: "api-probe", label: "فعالیت مسیر رله", state: "red", detail: "خطا در خواندن صف رله", measuredAt: new Date().toISOString() });
  }

  // ── لایهٔ ۳: تازگی داده + بکاپ مقدس (Full Sync) ──
  try {
    const [latestProperty, latestRequest] = await Promise.all([
      db.propertyRecord.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
      db.requestRecord.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    ]);
    const dataAge = now - Math.max(latestProperty?.updatedAt?.getTime() ?? 0, latestRequest?.updatedAt?.getTime() ?? 0);
    // بکاپ مقدس — از شاهد runtime
    let backupAgeMs: number | null = null;
    try {
      const w = JSON.parse(readFileSync(join(REPO_ROOT, "upload/.runtime/sacred-backups.json"), "utf8")) as { at?: string };
      if (w.at) backupAgeMs = now - new Date(w.at).getTime();
    } catch { /* شاهد نیست */ }
    const dataFresh = dataAge <= DATA_FRESH_WINDOW_MS;
    const backupFresh = backupAgeMs !== null && backupAgeMs <= BACKUP_FRESH_WINDOW_MS;
    const state: "green" | "yellow" | "red" = dataFresh && (backupFresh || backupAgeMs === null) ? "green" : dataFresh || backupFresh ? "yellow" : "red";
    layers.push({
      key: "full-sync",
      label: "تازگی داده و بکاپ",
      state,
      detail: `آخرین دادهٔ تازه ${dataAge > 0 ? agoFa(dataAge) : "نامشخص"}${backupAgeMs !== null ? ` · بکاپ مقدس ${agoFa(backupAgeMs)}` : " · شاهد بکاپ مقدس هنوز ساخته نشده"}`,
      measuredAt: new Date().toISOString(),
    });
  } catch {
    layers.push({ key: "full-sync", label: "تازگی داده و بکاپ", state: "red", detail: "خطا در خواندن تازگی داده", measuredAt: new Date().toISOString() });
  }

  // ── حکم نهایی ──
  const heartbeat = layers[0]!;
  const activity = layers[1]!;
  const verdict: RelayHealthReport["verdict"] =
    heartbeat.state === "red" && activity.state === "red" ? "red" : layers.some((l) => l.state === "red") ? "yellow" : layers.some((l) => l.state === "yellow") ? "yellow" : "green";
  const verdictFa = verdict === "green" ? "رله سالم — همهٔ لایه‌ها سبز" : verdict === "yellow" ? "رله فعال با هشدار" : "رله خاموش — اتصال گوشی قطع است";
  return { verdict, verdictFa, layers, computedAt: new Date().toISOString() };
}
