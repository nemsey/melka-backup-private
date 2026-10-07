/**
 * metrics.ts — رجیستری متریک درون‌حافظه‌ای ملکا (PN-013 فاز ۴ · مرحلهٔ ۶)
 * ---------------------------------------------------------------------------
 * سه لایهٔ رصدپذیری: Logs (logger) · Metrics (این ماژول) · Traces (requestId
 * سرتاسری — از UI تا DB با همان شناسه).
 *
 * اصول:
 *  ۱) صفر وابستگی — نه Next، نه Prisma؛ قابل استفاده در logger، proxy،
 *     روت‌ها، Worker و هستهٔ هوشمندی (پرهیز از مرز لایه‌ها).
 *  ۲) درون‌حافظه‌ای — حلقهٔ نمونه (سقف ۵۰۰ در هر متریک)؛ بدون I/O؛
 *     منبع پانل /api/v1/runtime/metrics (OWNER-only).
 *  ۳) برچسب‌ها در نام رمزشده می‌شوند (کاردینالیتی محدود و قابل پیش‌بینی:
 *     مسیرهای API و شناسهٔ کاشی — اعداد اختیاری هرگز برچسب نمی‌شوند).
 *  ۴) singleton روی globalThis — از HMR/بارگذاری‌های چندباره در یک فرایند
 *     زنده می‌ماند (همان الگوی صف کار job-queue).
 *
 * متریک‌های استاندارد (قرارداد PN-013):
 *   api.latency        — هر روت دارای withRouteLog (برچسب: مسیر)
 *   sync.duration      — هر رویداد همگام‌سازی ok/fail با مدت
 *   agent.latency      — فراخوانی ایجنت با مدت
 *   prediction.brier   — امتیاز بریهٔ تازه‌ترین ارزیابی کالیبراسیون
 */

const MAX_SAMPLES = 500;

export interface MetricStat {
  name: string;
  count: number;
  last: number | null;
  mean: number | null;
  p50: number | null;
  p95: number | null;
  max: number | null;
  lastAt: string | null;
}

interface MetricSlot {
  samples: number[];
  count: number;
  sum: number;
  max: number;
  last: number;
  lastAt: number;
}

interface MetricsGlobal {
  __melkMetrics?: Map<string, MetricSlot>;
}

const g = globalThis as typeof globalThis & MetricsGlobal;
const store: Map<string, MetricSlot> = (g.__melkMetrics ??= new Map());

/** رمز کردن برچسب‌ها در نام — ‎api.latency{path=/api/health}‎ */
function metricName(name: string, labels?: Record<string, string>): string {
  if (!labels || Object.keys(labels).length === 0) return name;
  const parts = Object.entries(labels)
    .filter(([, v]) => typeof v === "string" && v.length > 0 && v.length <= 120)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`);
  return parts.length ? `${name}{${parts.join(",")}}` : name;
}

/** ثبت یک نمونه — عدد صحیح/اعشاری؛ نامعتبرها بی‌صدا رد می‌شوند */
export function recordMetric(name: string, value: number, labels?: Record<string, string>): void {
  if (!Number.isFinite(value)) return;
  const key = metricName(name, labels);
  let slot = store.get(key);
  if (!slot) {
    slot = { samples: [], count: 0, sum: 0, max: -Infinity, last: value, lastAt: Date.now() };
    store.set(key, slot);
  }
  slot.samples.push(value);
  if (slot.samples.length > MAX_SAMPLES) slot.samples.shift();
  slot.count += 1;
  slot.sum += value;
  slot.max = Math.max(slot.max, value);
  slot.last = value;
  slot.lastAt = Date.now();
}

function percentile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[idx];
}

/** خلاصهٔ یک متریک (نام کامل با برچسب) — برای پانل و تست */
export function metricSummary(name: string): MetricStat | null {
  const slot = store.get(name);
  if (!slot) return null;
  const sorted = [...slot.samples].sort((a, b) => a - b);
  return {
    name,
    count: slot.count,
    last: slot.count ? slot.last : null,
    mean: slot.count ? Math.round((slot.sum / slot.count) * 100) / 100 : null,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    max: slot.count ? slot.max : null,
    lastAt: new Date(slot.lastAt).toISOString(),
  };
}

/** همهٔ متریک‌های هم‌خانوادهٔ یک نام پایه (بدون برچسب یا با هر برچسب) */
export function metricFamily(base: string): MetricStat[] {
  const out: MetricStat[] = [];
  for (const key of store.keys()) {
    if (key === base || key.startsWith(base + "{")) out.push(metricSummary(key)!);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** پاک‌سازی کامل (تست) */
export function resetMetrics(): void {
  store.clear();
}

export interface MetricsSnapshot {
  schema: string;
  capturedAt: string;
  process: {
    pid: number;
    uptimeSec: number;
    rssMB: number;
    heapUsedMB: number;
    nodeEnv: string | null;
  };
  families: Record<string, MetricStat[]>;
  knownFamilies: string[];
}

/** نمای کامل برای روت OWNER-only — فرایند + همهٔ خانواده‌های ثبت‌شده */
export function metricsSnapshot(families: string[] = ["api.latency", "sync.duration", "agent.latency", "prediction.brier"]): MetricsSnapshot {
  const mu = process.memoryUsage();
  return {
    schema: "melka-observability-v1",
    capturedAt: new Date().toISOString(),
    process: {
      pid: process.pid,
      uptimeSec: Math.round(process.uptime()),
      rssMB: Math.round((mu.rss / 1024 / 1024) * 10) / 10,
      heapUsedMB: Math.round((mu.heapUsed / 1024 / 1024) * 10) / 10,
      nodeEnv: process.env.NODE_ENV ?? null,
    },
    families: Object.fromEntries(families.map((f) => [f, metricFamily(f)])),
    knownFamilies: [...store.keys()].sort(),
  };
}
