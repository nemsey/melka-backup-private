/**
 * موتور اسکن فایل‌یابی دیوار — نسخهٔ ۳ (DIR-FF-SUPER-001 · دستور مالک «فوق پیشرفته کردن فایل‌یابی»)
 * ---------------------------------------------------------------------------
 * شناخت چندوجهی ساختار هر اسکن (پنج فاز زنده — DIR-FF-SUPER-001/گام اول):
 *  ۱) search  — جست‌وجوی چنددسته‌ای × چندصفحه‌ای در تبریز (وب عمومی یا کنار در صورت کلید)؛
 *      زنجیرهٔ دسته‌ها با خطوط موازی (categoryLanes) اجرا می‌شوند.
 *  ۲) details — واکشی جزئیات آگهی‌های تازه/تغییرکرده با «خطوط موازی» (detailLanes) و
 *      خواندن «انتشار آگهی» — فیلتر زمان بر زمان واقعی ایجاد اعمال می‌شود، نه ترتیب نردبان.
 *      کشف فراجامع فایل‌های شخصی: برچسب رسمی آگهی‌دهنده (BUSINESS_SECTION) + متن
 *      زیرین کارت فهرست + سیگنال‌های متنی — قانون مالک: فایل غیرشخصی کاملاً رد می‌شود.
 *  ۳) stats   — بازسازی آمار قیمت بازار (میانه/چارک به تفکیک محله و دسته).
 *  ۴) rescore — بازامتیازدهی فایل‌های ذخیره‌شده با مرجع تازه بازار.
 *  ۵) finalize — ثبت گزارش اسکن (DivarScanLog) + خلاصهٔ فارسی.
 *
 * DIR-FF-SUPER-001/گام دوم — اسکن دیوار بی‌واسطهٔ ترموکس (بدون رله):
 *   کل اسکن در «پس‌زمینهٔ سرور» به‌صورت «کارِ اسکن» (ScanJob) اجرا می‌شود؛
 *   POST /api/divar/scan فوراً (کمتر از یک ثانیه) وضعیت کار را برمی‌گرداند و
 *   UI با نظارت ۲.۵ثانیه‌ای پیشرفت زنده را می‌خواند ⇒ مهلت ۲۰ثانیه‌ای مرورگر
 *   هرگز درگیر اسکن نمی‌شود و پیام گمراه‌کنندهٔ رله/ترموکس برای اسکن منتفی است.
 *   خود اسکن هم عین قبل «fetch مستقیم» از وب عمومی دیوار است (client.ts) —
 *   صفر اتصال به صف رله؛ رلهٔ ترموکس مختص ثبت فایل در سامانه ARM است (روت register).
 *
 * پایداریِ صف اجرا (خواص ساختاری نسخهٔ ۳):
 *   · تک‌نمونه بودن کار اسکن با قفل سراسری (startScanJob در حالت running → started=false).
 *   · خطای یک آگهی هرگز کل اسکن را نمی‌اندازد (ایزوله‌سازی per-item در هر خط).
 *   · آگهی‌های شناخته‌شدهٔ بی‌تغییر فقط lastSeen می‌گیرند — و این بار «دسته‌ای» (updateMany).
 *   · شمارنده‌ها در حافظهٔ کار زنده‌اند و به‌صورت تناوبی در DivarScanLog نیز می‌نشینند.
 */

import { db } from "@/lib/db";
import { webSearchTabriz, webGetPostDetail, kenarSearch, classifyPublisherKind, parseActiveAdCount, type DivarPostDetail } from "./client";
import { loadDivarSettings, readKenarKey, kenarPostToFields } from "./store";
import { timeWindowHours, DIVAR_CONFIG, type DivarSettings } from "./config";
import { locationAllowed } from "./tabriz-locations";
import {
  parsePriceToman,
  parsePricePerMeterToman,
  parseMeterage,
  parseFloor,
  parseBuildYear,
  parseRooms,
  parseDivarJalaliDateTime,
} from "./parse";
import { scorePersonalAd, scoreUnderprice, scoreLocation, scoreOtherFactors, computeTotalScore, shouldAutoReject, type AdBucket, type LocationMatchResult, type OtherFactorsResult } from "./scoring";

export interface ScanSummary {
  ok: boolean;
  source: "web" | "kenar";
  scanned: number;
  fetched: number;
  inWindow: number;
  /** آگهی‌های درون بازه که بیرون از مناطق انتخابی مالک بودند و ذخیره نشدند */
  outOfArea: number;
  /** آگهی‌های غیرشخصی (مشاور/دپارتمان املاک) که به‌موجب قانون مالک کاملاً رد شدند */
  autoRejected: number;
  newAds: number;
  updatedAds: number;
  durationMs: number;
  message: string;
}

// ═══════════════ کارِ اسکن — نمای زنده برای UI (DIR-FF-SUPER-001) ═══════════════

/** فازهای پنج‌گانهٔ اسکن چندوجهی */
export type ScanJobPhase = "search" | "details" | "stats" | "rescore" | "finalize";

/** برچسب فارسی هر فاز — عین نمایش UI */
export const SCAN_PHASE_LABELS: Record<ScanJobPhase, string> = {
  search: "جست‌وجوی چنددسته‌ای دیوار (مستقیم از وب — بی‌رله)",
  details: "واکشی جزئیات و تحلیل چندوجهی فایل‌ها (خطوط موازی)",
  stats: "بازسازی آمار قیمت بازار",
  rescore: "بازامتیازدهی فایل‌های ذخیره‌شده",
  finalize: "ثبت گزارش اسکن",
};

/** شمارنده‌های زندهٔ پیشرفت کار اسکن */
export interface ScanJobProgress {
  /** آگهی‌های دیده‌شده در جست‌وجو */
  scanned: number;
  /** آگهی‌های پردازش‌شده در فاز جزئیات */
  processed: number;
  /** کل صف یکتای فاز جزئیات */
  queueTotal: number;
  fetched: number;
  inWindow: number;
  outOfArea: number;
  autoRejected: number;
  newAds: number;
  updatedAds: number;
}

/** وضعیت کار اسکن — عین قرارداد GET/POST /api/divar/scan (فیلد job) */
export interface ScanJobView {
  id: string;
  status: "running" | "done" | "failed";
  /** منشأ کار: manual = کلید «اسکن دیوار» مالک · auto = اسکن خودکار دوره‌ای */
  triggeredBy: "manual" | "auto";
  startedAt: string;
  updatedAt: string;
  phase: ScanJobPhase;
  phaseLabel: string;
  progress: ScanJobProgress;
  durationMs: number;
  summary: ScanSummary | null;
  error: string | null;
}

/** رکورد کار در حافظهٔ سرور — تک‌نمونه (قفل اجرای همزمان دو اسکن) */
interface ScanJobRuntime {
  view: ScanJobView;
  promise: Promise<void> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var __divarScanJob: ScanJobRuntime | undefined;
}

/** تصویرِ امن از کار جاری برای پاسخ روت (کپی عمیق — گیرندگی وضعیت زنده) */
function snapshotJob(): ScanJobView | null {
  const rt = globalThis.__divarScanJob;
  if (!rt) return null;
  return JSON.parse(JSON.stringify(rt.view)) as ScanJobView;
}

/** وضعیت کارِ جاری (یا آخرین کار تمام‌شده) — برای GET /api/divar/scan */
export function getScanJob(): ScanJobView | null {
  return snapshotJob();
}

/**
 * آغاز «کار اسکن» در پس‌زمینهٔ سرور — بی‌انتظار (گام دوم: روت فوری برمی‌گرداند).
 * اگر اسکنی در حال اجرا باشد، کار موجود برگردانده می‌شود (started=false — قفل تک‌نمونه).
 */
export function startScanJob(triggeredBy: "manual" | "auto" = "manual"): { started: boolean; job: ScanJobView } {
  const rt = globalThis.__divarScanJob;
  if (rt && rt.view.status === "running") {
    const job = snapshotJob();
    if (job) return { started: false, job };
  }
  const view: ScanJobView = {
    id: `scan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    status: "running",
    triggeredBy,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    phase: "search",
    phaseLabel: SCAN_PHASE_LABELS.search,
    progress: { scanned: 0, processed: 0, queueTotal: 0, fetched: 0, inWindow: 0, outOfArea: 0, autoRejected: 0, newAds: 0, updatedAds: 0 },
    durationMs: 0,
    summary: null,
    error: null,
  };
  const runtime: ScanJobRuntime = { view, promise: null };
  globalThis.__divarScanJob = runtime;
  // اجرای پس‌زمینه — هرگز به فراخواننده نمی‌اندازد (runDivarScan خودش خطا را ثبت می‌کند)
  runtime.promise = (async () => {
    await runDivarScan({ job: view });
  })();
  return { started: true, job: snapshotJob()! };
}

interface AdAnalysis {
  personal: ReturnType<typeof scorePersonalAd>;
  underprice: ReturnType<typeof scoreUnderprice>;
  other: OtherFactorsResult;
  location: ReturnType<typeof scoreLocation>;
}

/** آمار بازار فعلی برای یک محله (از آگهی‌های ذخیره‌شده) */
async function marketRefFor(lineId: string | null, category: string, minSample: number): Promise<{ median: number | null; count: number }> {
  if (!lineId) return { median: null, count: 0 };
  const stat = await db.marketPriceStat.findUnique({ where: { scopeKey: `line:${lineId}` } });
  if (stat && stat.sampleCount >= minSample) return { median: stat.medianPerMeter, count: stat.sampleCount };
  // جایگزین: آمار سطح دسته
  const catStat = await db.marketPriceStat.findUnique({ where: { scopeKey: `cat:${category}` } });
  if (catStat && catStat.sampleCount >= minSample) return { median: catStat.medianPerMeter, count: catStat.sampleCount };
  return { median: null, count: 0 };
}

/** بازسازی آمار قیمت بازار از آگهی‌های ذخیره‌شده (میانه + چارک‌ها) */
async function rebuildMarketStats(settings: DivarSettings): Promise<void> {
  const ads = await db.divarAd.findMany({
    where: { status: "active", pricePerMeter: { not: null } },
    select: { matchedLineId: true, category: true, pricePerMeter: true },
    take: 5000,
  });
  type Bucket = { values: number[] };
  const byLine = new Map<string, Bucket>();
  const byCat = new Map<string, Bucket>();
  for (const ad of ads) {
    if (!ad.pricePerMeter) continue;
    if (ad.matchedLineId) {
      const b = byLine.get(ad.matchedLineId) ?? { values: [] };
      b.values.push(ad.pricePerMeter);
      byLine.set(ad.matchedLineId, b);
    }
    const c = byCat.get(ad.category) ?? { values: [] };
    c.values.push(ad.pricePerMeter);
    byCat.set(ad.category, c);
  }
  const quantile = (sorted: number[], q: number): number => {
    if (!sorted.length) return 0;
    const pos = (sorted.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    return sorted[base + 1] !== undefined ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
  };
  const upserts: { scopeKey: string; medianPerMeter: number; p25: number; p75: number; count: number }[] = [];
  for (const [lineId, b] of byLine) {
    const sorted = [...b.values].sort((x, y) => x - y);
    upserts.push({ scopeKey: `line:${lineId}`, medianPerMeter: quantile(sorted, 0.5), p25: quantile(sorted, 0.25), p75: quantile(sorted, 0.75), count: sorted.length });
  }
  for (const [cat, b] of byCat) {
    const sorted = [...b.values].sort((x, y) => x - y);
    upserts.push({ scopeKey: `cat:${cat}`, medianPerMeter: quantile(sorted, 0.5), p25: quantile(sorted, 0.25), p75: quantile(sorted, 0.75), count: sorted.length });
  }
  for (const u of upserts) {
    await db.marketPriceStat.upsert({
      where: { scopeKey: u.scopeKey },
      create: { scopeKey: u.scopeKey, medianPerMeter: u.medianPerMeter, p25PerMeter: u.p25, p75PerMeter: u.p75, sampleCount: u.count },
      update: { medianPerMeter: u.medianPerMeter, p25PerMeter: u.p25, p75PerMeter: u.p75, sampleCount: u.count },
    });
  }
}

/** استخراج فیلدهای ساختاری از جزئیات آگهی */
function extractAdFields(detail: DivarPostDetail) {
  let meterage: number | null = null;
  let rooms: number | null = null;
  let buildYear: number | null = null;
  let floor: number | null = null;
  let priceTotal: number | null = null;
  let pricePerMeter: number | null = null;
  for (const s of detail.specs) {
    if (s.title.includes("متراژ") && meterage == null) meterage = parseMeterage(s.value);
    else if (s.title.includes("اتاق") && rooms == null) rooms = parseRooms(s.value);
    else if (s.title.includes("ساخت") && buildYear == null) buildYear = parseBuildYear(s.value);
    else if (s.title.includes("طبقه") && floor == null) floor = parseFloor(s.value)?.floor ?? null;
  }
  priceTotal = parsePriceToman(detail.priceTotalText);
  pricePerMeter = parsePricePerMeterToman(detail.pricePerMeterText);
  if (!pricePerMeter && priceTotal && meterage && meterage >= 10) {
    pricePerMeter = Math.round(priceTotal / meterage);
  }
  return { meterage, rooms, buildYear, floor, priceTotal, pricePerMeter };
}

/** امتیازدهی کامل یک آگهی شخصی — مکان می‌تواند از قبل (برای فیلتر مکانی) محاسبه شده باشد */
async function scoreAd(
  detail: DivarPostDetail,
  fields: ReturnType<typeof extractAdFields>,
  settings: DivarSettings,
  publishedAt: Date | null,
  preLocation?: LocationMatchResult
): Promise<{ analysis: AdAnalysis; total: ReturnType<typeof computeTotalScore> }> {
  const personal = scorePersonalAd({
    title: detail.title,
    description: detail.description,
    // برچسب رسمی دیوار زیر نقشه — قطعی‌ترین سیگنال شخصی‌بودن
    publisherType: detail.publisherType,
    publisherName: detail.publisherName,
  });
  const market = await marketRefFor(null, detail.category ?? "apartment-sell", settings.minMarketSample);
  const location =
    preLocation ??
    scoreLocation({
      title: detail.title,
      locationText: detail.locationText,
      description: detail.description,
      latitude: detail.latitude,
      longitude: detail.longitude,
      selectedAreaIds: settings.areaIds,
      selectedLineIds: settings.lineIds,
    });
  const lineRef = await marketRefFor(location.lineId, detail.category ?? "apartment-sell", settings.minMarketSample);
  const ref = lineRef.median ? { median: lineRef.median, count: lineRef.count } : market;
  const underprice = scoreUnderprice({
    pricePerMeter: fields.pricePerMeter,
    ref: ref.median ? { medianPerMeter: ref.median, sampleCount: ref.count, source: "divar" as const } : null,
    armRefPerMeter: null,
    armWeight: settings.armPriceWeight,
    minSample: settings.minMarketSample,
  });
  // شاهکار ایجنت — سایر فاکتورهای فایل بهینه (فوریت/تازگی/تکمیل داده/اصالت/آمادگی/دقت مکان)
  const other = scoreOtherFactors({
    title: detail.title,
    description: detail.description,
    priceTotal: fields.priceTotal,
    pricePerMeter: fields.pricePerMeter,
    meterage: fields.meterage,
    rooms: fields.rooms,
    floor: fields.floor,
    buildYear: fields.buildYear,
    photoCount: detail.images?.length ?? 0,
    publishedAt,
    location: { score: location.score, reason: location.reason },
  });
  const total = computeTotalScore({
    personal: personal.score,
    underprice: underprice.score,
    other: other.score,
    location: location.score,
    settings,
  });
  return { analysis: { personal, underprice, other, location }, total };
}

// ═══════════════ خطوط موازی — استخر سادهٔ کارگرها (چندوجهی‌سازی سرعت) ═══════════════

/** اجرای items روی n خط موازی — هر خط تا اتمام صف پیش می‌رود؛ خطا هر آیتم توسط فراخواننده ایزوله می‌شود */
async function runPool<T>(items: readonly T[], lanes: number, worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const width = Math.max(1, Math.min(lanes, items.length || 1));
  const runners = Array.from({ length: width }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      await worker(items[i]!);
    }
  });
  await Promise.all(runners);
}

/** آیا زمان اسکن خودکار رسیده؟ (فراخوانی فرصت‌طلبانه از API فهرست آگهی‌ها) */
export async function autoScanDue(): Promise<boolean> {
  const settings = await loadDivarSettings();
  if (settings.autoScanMinutes <= 0) return false;
  const last = await db.divarScanLog.findFirst({ where: { error: null }, orderBy: { startedAt: "desc" } });
  if (!last) return true;
  return Date.now() - last.startedAt.getTime() >= settings.autoScanMinutes * 60 * 1000;
}

/** اسکن در پس‌زمینه — خطا هرگز به فراخواننده نمی‌رسد (اکنون از دل «کار اسکن» می‌گذرد) */
export function triggerBackgroundScan(): void {
  startScanJob("auto");
}

/**
 * اجرای کامل یک اسکن — موتور چندوجهی نسخهٔ ۳.
 * `job` حاضر باشد، فازها/شمارنده‌ها در نمای زندهٔ کار می‌نشینند (پیشرفت زندهٔ UI)؛
 * غایب باشد (فراخوانی مستقیم/تست)، همان قرارداد خروجی ScanSummary نسخهٔ قبل برمی‌گردد.
 */
export async function runDivarScan(input: { force?: boolean; job?: ScanJobView } = {}): Promise<ScanSummary> {
  const started = Date.now();
  const job = input.job ?? null;
  const counters: ScanJobProgress = job
    ? job.progress
    : { scanned: 0, processed: 0, queueTotal: 0, fetched: 0, inWindow: 0, outOfArea: 0, autoRejected: 0, newAds: 0, updatedAds: 0 };

  const setPhase = (phase: ScanJobPhase): void => {
    if (!job) return;
    job.phase = phase;
    job.phaseLabel = SCAN_PHASE_LABELS[phase];
    job.updatedAt = new Date().toISOString();
  };

  const settings = await loadDivarSettings();
  const kenarKey = await readKenarKey().catch(() => null);
  const kenarRow = await db.divarConnection.findUnique({ where: { method: "kenar" } }).catch(() => null);
  const useKenar = Boolean(kenarKey && kenarRow?.status === "connected");

  const hours = timeWindowHours(settings.timeWindow);
  const windowStart = new Date(Date.now() - hours * 3600 * 1000);

  const locationFilterActive = settings.areaIds.length > 0 || settings.lineIds.length > 0;
  const log = await db.divarScanLog.create({ data: { source: useKenar ? "kenar" : "web" } });

  // تناوب نوشتن شمارنده‌ها در گزارش DB (هر ~۱۰ث یا پایان فاز) — باریک و بی‌افت
  let lastLogSyncAt = Date.now();
  const syncLogThrottled = async (force = false): Promise<void> => {
    const now = Date.now();
    if (!force && now - lastLogSyncAt < 10_000) return;
    lastLogSyncAt = now;
    await db.divarScanLog
      .update({
        where: { id: log.id },
        data: {
          scanned: counters.scanned,
          fetched: counters.fetched,
          inWindow: counters.inWindow,
          outOfArea: counters.outOfArea,
          autoRejected: counters.autoRejected,
          newAds: counters.newAds,
          updatedAds: counters.updatedAds,
          durationMs: now - started,
        },
      })
      .catch(() => undefined);
  };

  try {
    // ═══ فاز ۱ — جست‌وجوی چنددسته‌ای (زنجیرهٔ دسته‌ها با خطوط موازی) ═══
    setPhase("search");
    const tokenQueue: { token: string; title: string; priceText: string | null; category: string; bottomText: string | null }[] = [];
    const searchOneCategory = async (category: string): Promise<void> => {
      let searchUid: string | null = null;
      let viewedTokens: string | null = null;
      let lastPostDate: string | null = null;
      for (let page = 1; page <= settings.maxScanPages; page++) {
        if (useKenar && kenarKey) {
          const res = await kenarSearch(kenarKey, { category, page });
          for (const p of res.posts) {
            tokenQueue.push({ token: p.token, title: "", priceText: null, category, bottomText: null });
          }
          counters.scanned += res.posts.length;
          if (!res.hasMore) break;
        } else {
          const res = await webSearchTabriz({ category, page, searchUid, viewedTokens, lastPostDate });
          for (const r of res.rows) {
            tokenQueue.push({ token: r.token, title: r.title, priceText: r.priceText, category, bottomText: r.bottomText });
          }
          counters.scanned += res.rows.length;
          searchUid = res.searchUid;
          viewedTokens = res.viewedTokens;
          lastPostDate = res.lastPostDate;
          if (!res.hasMore) break;
        }
      }
    };
    await runPool(settings.categories, DIVAR_CONFIG.scanCategoryLanes, searchOneCategory);
    await syncLogThrottled(true);

    // ═══ فاز ۲ — جزئیات آگهی‌های تازه/تغییرکرده با خطوط موازی ═══
    // حذف تکراری‌های صف — یک توکن ممکن است در چند دسته دیده شود
    const seenTokens = new Set<string>();
    const uniqueQueue = tokenQueue.filter((t) =>
      seenTokens.has(t.token) ? false : (seenTokens.add(t.token), true)
    );
    counters.queueTotal = uniqueQueue.length;
    setPhase("details");

    const known = await db.divarAd.findMany({
      where: { token: { in: uniqueQueue.map((t) => t.token) } },
      select: { token: true, changeKey: true, price: true, publishedAt: true, totalScore: true },
    });
    const knownMap = new Map(known.map((k) => [k.token, k]));
    // آگهی‌های شناخته‌شدهٔ بی‌تغییر — آخرین دیدن دسته‌ای ثبت می‌شود (پایان فاز)
    const unchangedTokens: string[] = [];

    const processOneAd = async (item: (typeof uniqueQueue)[number]): Promise<void> => {
      try {
        const existing = knownMap.get(item.token);
        // R7 (فرمان مالک ۲۰۲۶-۱۱-۰۱ — اصلاح مکانیسم فایل‌یابی): priceText کارت جست‌وجو
        // متن خام فارسی است («۱۳,۶۰۰,۰۰۰,۰۰۰ تومان») ولی changeKey ذخیره‌شده از
        // priceTotalِ تجزیه‌شدهٔ عددی است (13600000000) — این دو هرگز برابر نبودند، پس
        // هر اسکن جزئیات «همهٔ» آگهی‌های شناخته‌شده را دوباره می‌گرفت (~۶۰٪ سهمیهٔ fetch
        // هدر می‌رفت). اکنون حدس هم در همان فضای عددی تجزیه می‌شود → آگهی شناخته‌شدهٔ
        // بی‌تغییر فقط lastSeen می‌گیرد و سهمیهٔ fetch برای عمق بیشتر آزاد می‌شود.
        const newChangeKeyGuess = `${item.token}|${parsePriceToman(item.priceText) ?? "np"}`;
        if (existing && existing.changeKey === newChangeKeyGuess) {
          // آگهی شناخته‌شده بدون تغییر مهم — ثبت دسته‌ای «دیدن دوباره» در پایان فاز
          unchangedTokens.push(item.token);
          return;
        }
        // آگهی تازه یا تغییر قیمت → جزئیات لازم است
        const detail = await webGetPostDetail(item.token).catch(() => null);
        if (!detail) {
          return;
        }
        counters.fetched += 1;
        // پشتیبان نام کسب‌وکار: متن زیرین کارت فهرست جست‌وجو («گروه مشاورین املاک طاهری»)
        if (detail.publisherType && detail.publisherType !== "personal" && !detail.publisherName && item.bottomText && !item.bottomText.includes("پیش")) {
          detail.publisherName = item.bottomText;
          if (detail.publisherType === "business") detail.publisherType = classifyPublisherKind(item.bottomText);
        }
        const fields = extractAdFields(detail);
        const publishedAt = parseDivarJalaliDateTime(detail.publishedText);
        const bumpedAt = parseDivarJalaliDateTime(detail.lastBumpText);

        // فیلتر زمان واقعی انتشار — قلب حساسیت به «زمان ایجاد»
        if (!publishedAt || publishedAt < windowStart) {
          // رد سیستم: بیرون از بازه — هرگز ذخیره نمی‌شود
          return;
        }
        counters.inWindow += 1;

        // فیلتر مکان (منطبق با سامانه آرم): تطبیق مکانی پیش از امتیازدهی کامل محاسبه می‌شود؛
        // آگهی بیرون از مناطق انتخابی یا بدون نشانه مکانی قابل اتکا، هرگز ذخیره نمی‌شود (رد سیستم).
        const location = scoreLocation({
          title: detail.title,
          locationText: detail.locationText,
          description: detail.description,
          latitude: detail.latitude,
          longitude: detail.longitude,
          selectedAreaIds: settings.areaIds,
          selectedLineIds: settings.lineIds,
        });
        if (!locationAllowed({ areaId: location.areaId, lineId: location.lineId }, settings)) {
          counters.outOfArea += 1;
          return;
        }

        const { analysis, total } = await scoreAd(detail, fields, settings, publishedAt, location);

        // قانون مالک ۱ و ۲: فایل غیرشخصی (مشاور/دپارتمان املاک) کاملاً رد می‌شود —
        // هرگز ذخیره/امتیازدهی/دسته‌بندی نمی‌شود؛ فقط شمارنده رد خودکار ثبت می‌شود.
        if (shouldAutoReject(analysis.personal, detail.publisherType)) {
          counters.autoRejected += 1;
          return;
        }

        const analysisJson = JSON.stringify({
          personal: { score: analysis.personal.score, isBroker: analysis.personal.isBroker, confidence: analysis.personal.confidence, signals: analysis.personal.signals },
          underprice: {
            score: analysis.underprice.score,
            percentBelow: analysis.underprice.percentBelow,
            referencePerMeter: analysis.underprice.referencePerMeter,
            sampleCount: analysis.underprice.sampleCount,
            method: analysis.underprice.method,
            reason: analysis.underprice.reason,
          },
          other: { score: analysis.other.score, factors: analysis.other.factors, reason: analysis.other.reason },
          location: { score: analysis.location.score, method: analysis.location.method, reason: analysis.location.reason, areaName: analysis.location.areaName, lineName: analysis.location.lineName },
        });

        const changeKey = `${item.token}|${fields.priceTotal ?? "np"}`;
        const data = {
          category: detail.category ?? item.category,
          title: detail.title || item.title,
          description: detail.description,
          priceText: detail.priceTotalText ?? item.priceText,
          price: fields.priceTotal,
          pricePerMeter: fields.pricePerMeter,
          meterage: fields.meterage,
          rooms: fields.rooms,
          floor: fields.floor,
          buildYear: fields.buildYear,
          publishedAt,
          bumpedAt,
          locationText: detail.locationText,
          latitude: detail.latitude,
          longitude: detail.longitude,
          matchedAreaId: analysis.location.areaId,
          matchedAreaName: analysis.location.areaName,
          matchedLineId: analysis.location.lineId,
          matchedLineName: analysis.location.lineName,
          personalScore: analysis.personal.score,
          underpriceScore: analysis.underprice.score,
          otherScore: analysis.other.score,
          locationScore: analysis.location.score,
          totalScore: total.total,
          bucket: total.bucket,
          analysisJson,
          imagesJson: JSON.stringify(detail.images.slice(0, 12)),
          specsJson: JSON.stringify(detail.specs),
          // آگهی‌دهنده — برچسب زیر نقشه دیوار
          publisherType: detail.publisherType ?? null,
          publisherName: detail.publisherName ?? null,
          publisherAdCount: detail.publisherAdCountText ? parseActiveAdCount(detail.publisherAdCountText) : null,
          publisherBrandUrl: detail.publisherBrandUrl ?? null,
          changeKey,
          lastSeenAt: new Date(),
        };

        if (existing) {
          // تغییر مهم (قیمت) یا صعود امتیاز → به‌روزرسانی
          const scoreImproved = total.total > (existing.totalScore ?? 0) + 5;
          if (changeKey !== existing.changeKey || scoreImproved) {
            await db.divarAd.update({ where: { token: item.token }, data });
            counters.updatedAds += 1;
          } else {
            await db.divarAd.update({ where: { token: item.token }, data: { lastSeenAt: new Date() } });
          }
        } else {
          try {
            await db.divarAd.create({ data: { token: item.token, status: "active", ...data } });
            counters.newAds += 1;
          } catch (createErr) {
            // رقابت همزمان/تکرار توکن → به‌روزرسانی به‌جای خطا
            const code = (createErr as { code?: string }).code;
            if (code === "P2002") {
              await db.divarAd.update({ where: { token: item.token }, data }).catch(() => undefined);
              counters.updatedAds += 1;
            } else {
              throw createErr;
            }
          }
        }
      } catch {
        // ایزوله‌سازی per-item — یک آگهیِ خطادار هرگز کل اسکن چندوجهی را نمی‌اندازد
      } finally {
        // هر آیتم دقیقاً یک بار شمرده می‌شود — همهٔ مسیرهای بازگشت از همین‌جا می‌گذرند
        counters.processed += 1;
      }
    };

    await runPool(uniqueQueue, DIVAR_CONFIG.scanDetailLanes, processOneAd);
    counters.processed = counters.queueTotal;
    // ثبت دسته‌ایِ «دیدن دوباره» برای آگهی‌های بی‌تغییر (صفر نوشتن اگر هیچ‌کدام نبود)
    const seenNow = new Date();
    for (let i = 0; i < unchangedTokens.length; i += 400) {
      const chunk = unchangedTokens.slice(i, i + 400);
      await db.divarAd.updateMany({ where: { token: { in: chunk } }, data: { lastSeenAt: seenNow } }).catch(() => undefined);
    }
    await syncLogThrottled(true);

    // ═══ فاز ۳ — بازسازی آمار بازار و بازامتیازدهی ═══
    setPhase("stats");
    await rebuildMarketStats(settings);
    setPhase("rescore");
    await rescoreAgainstMarket(settings);

    // ═══ فاز ۵ — ثبت گزارش ═══
    setPhase("finalize");
    const durationMs = Date.now() - started;
    const summary: ScanSummary = {
      ok: true,
      source: useKenar ? "kenar" : "web",
      scanned: counters.scanned,
      fetched: counters.fetched,
      inWindow: counters.inWindow,
      outOfArea: counters.outOfArea,
      autoRejected: counters.autoRejected,
      newAds: counters.newAds,
      updatedAds: counters.updatedAds,
      durationMs,
      message: `اسکن کامل شد — ${counters.newAds} فایل شخصی تازه، ${counters.updatedAds} به‌روزشده از ${counters.inWindow} آگهی درون بازه؛ ${counters.autoRejected} فایل غیرشخصی (مشاور/دپارتمان املاک) به‌موجب قانون مالک کاملاً رد شد${locationFilterActive ? `؛ ${counters.outOfArea} آگهی بیرون از مناطق انتخابی رد شد (فیلتر مکان فعال)` : " (فیلتر مکان: همه تبریز)"}.`,
    };
    await db.divarScanLog.update({
      where: { id: log.id },
      data: { durationMs, scanned: counters.scanned, fetched: counters.fetched, inWindow: counters.inWindow, outOfArea: counters.outOfArea, autoRejected: counters.autoRejected, newAds: counters.newAds, updatedAds: counters.updatedAds },
    });
    if (job) {
      job.summary = summary;
      job.status = "done";
      job.durationMs = durationMs;
      job.updatedAt = new Date().toISOString();
    }
    // شاهد ممیزی پایان کار — بهترین‌تلاش (گزارش کامل در DivarScanLog نشسته است)
    const { audit } = await import("@/lib/auth/session");
    await audit("DIVAR_SCAN", `scan-job:${job?.id ?? log.id}`, `new=${counters.newAds} inWindow=${counters.inWindow} fetched=${counters.fetched} lanes=${DIVAR_CONFIG.scanDetailLanes}`).catch(() => undefined);
    return summary;
  } catch (err) {
    const message = (err as Error).message ?? "خطای نامشخص در اسکن";
    const durationMs = Date.now() - started;
    await db.divarScanLog.update({
      where: { id: log.id },
      data: { error: message.slice(0, 300), durationMs, scanned: counters.scanned, fetched: counters.fetched, inWindow: counters.inWindow, outOfArea: counters.outOfArea, autoRejected: counters.autoRejected, newAds: counters.newAds, updatedAds: counters.updatedAds },
    }).catch(() => undefined);
    if (job) {
      job.status = "failed";
      job.error = message.slice(0, 300);
      job.durationMs = durationMs;
      job.updatedAt = new Date().toISOString();
    }
    return { ok: false, source: useKenar ? "kenar" : "web", scanned: counters.scanned, fetched: counters.fetched, inWindow: counters.inWindow, outOfArea: counters.outOfArea, autoRejected: counters.autoRejected, newAds: counters.newAds, updatedAds: counters.updatedAds, durationMs, message };
  }
}

/** بازامتیازدهی آگهی‌های موجود پس از به‌روز شدن آمار بازار (زیرقیمت، سایر فاکتورها و کل)
 * + پُرسازی یک‌باره «سایر فاکتورهای بهینه» برای فایل‌های ذخیره‌شده پیش از قوانین نسخه ۳ */
async function rescoreAgainstMarket(settings: DivarSettings): Promise<void> {
  const ads = await db.divarAd.findMany({
    where: { status: "active" },
    take: 2000,
    select: {
      token: true, pricePerMeter: true, category: true, personalScore: true, otherScore: true, locationScore: true,
      totalScore: true, matchedLineId: true, analysisJson: true,
      title: true, description: true, price: true, meterage: true, rooms: true, floor: true, buildYear: true,
      publishedAt: true, imagesJson: true,
    },
  });
  for (const ad of ads) {
    const lineRef = await marketRefFor(ad.matchedLineId, ad.category, settings.minMarketSample);
    const ref = lineRef.median
      ? { medianPerMeter: lineRef.median, sampleCount: lineRef.count, source: "divar" as const }
      : null;
    const underprice = scoreUnderprice({
      pricePerMeter: ad.pricePerMeter,
      ref,
      armWeight: settings.armPriceWeight,
      minSample: settings.minMarketSample,
    });
    let analysisObj: Record<string, unknown> = {};
    try {
      analysisObj = JSON.parse(ad.analysisJson ?? "{}") as Record<string, unknown>;
    } catch {
      analysisObj = {};
    }
    // پُرسازی یک‌باره: فایل‌های پیش از نسخه ۳ «سایر فاکتور» ندارند → با شاهکار ایجنت تحلیل می‌شوند
    let otherScore = ad.otherScore ?? 0;
    let otherDirty = false;
    if (!analysisObj.other) {
      let photoCount = 0;
      try {
        photoCount = (JSON.parse(ad.imagesJson ?? "[]") as unknown[]).length;
      } catch {
        photoCount = 0;
      }
      const other = scoreOtherFactors({
        title: ad.title,
        description: ad.description,
        priceTotal: ad.price,
        pricePerMeter: ad.pricePerMeter,
        meterage: ad.meterage,
        rooms: ad.rooms,
        floor: ad.floor,
        buildYear: ad.buildYear,
        photoCount,
        publishedAt: ad.publishedAt,
        location: { score: ad.locationScore ?? 0 },
      });
      otherScore = other.score;
      otherDirty = true;
      analysisObj.other = { score: other.score, factors: other.factors, reason: other.reason };
    }
    const total = computeTotalScore({
      personal: ad.personalScore,
      underprice: underprice.score,
      other: otherScore,
      location: ad.locationScore,
      settings,
    });
    if (total.total === ad.totalScore && !otherDirty) continue;
    analysisObj.underprice = {
      score: underprice.score,
      percentBelow: underprice.percentBelow,
      referencePerMeter: underprice.referencePerMeter,
      sampleCount: underprice.sampleCount,
      method: underprice.method,
      reason: underprice.reason,
    };
    await db.divarAd.update({
      where: { token: ad.token },
      data: {
        underpriceScore: underprice.score,
        otherScore,
        totalScore: total.total,
        bucket: total.bucket,
        analysisJson: JSON.stringify(analysisObj),
      },
    });
  }
}

export type { AdBucket };
