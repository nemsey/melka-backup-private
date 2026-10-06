/* ============================================================================
 * P6527 — پنجره‌یابی فهرست‌های بزرگ (منطق خالص — بدون DOM)
 * ============================================================================
 * ریشه‌یابی «preview در موبایل کار نمی‌کند»: کاشی M1 (۱۱٬۳۹۸ ردیف) و M2 (۷٬۳۱۴ ردیف)
 * همهٔ ردیف‌ها را همزمان در DOM می‌ساختند؛ مرورگر موبایل (اندروید) هنگام باز شدن
 * کاشی فریز/کرش می‌شد (شاهد زنده: کرش تکرارشدنی Chrome هدلس در همین کانتینر).
 *
 * راه‌حل وفادار به «قانون همیشگی فهرست‌ها» (AGENTS.md §۶):
 *   فهرست همچنان تک‌صفحه‌ای است — تمام ردیف‌ها با یک اسکرول در دسترس‌اند،
 *   ارتفاع کل (اسکرول‌بار) عین تعداد کل ردیف‌هاست، فقط «رندر» پنجره‌ای می‌شود:
 *   در هر لحظه ~۴۰ ردیفِ قابل‌دیدن + دو فاصله‌گذار (spacer) در DOM هست.
 *   ⇒ بارگذاری فوری + اسکرول سریع در هر اندازهٔ فهرست (قانون بندهای ۲ و ۴).
 *
 * این ماژول «منبع یگانهٔ» محاسبات پنجره است تا تست‌پذیر باشد (بدون jsdom).
 */

/** سقف رندر ساده: فهرست‌های تا این اندازه بدون پنجره‌یابی، عیناً رندر می‌شوند */
export const PLAIN_RENDER_MAX = 200;

/** ارتفاع تخمینی پیش‌فرض هر ردیف تا پیش از اندازه‌گیری (px) */
export const DEFAULT_ROW_HEIGHT = 44;

/** ردیف‌های اضافی بالا/پایین پنجرهٔ دید تا اسکرول سریع بدون چشمک باشد */
export const OVERSCAN_ROWS = 8;

/** ارتفاع دید پیش‌فرض تا پیش از اندازه‌گیری ظرف (px) — حدس محافظه‌کارانهٔ موبایل/دسکتاپ */
export const DEFAULT_VIEWPORT_HEIGHT = 640;

export interface VirtualWindow {
  /** نخستین اندیس رندرشده (شامل overscan) */
  start: number;
 /** یکی پس از آخرین اندیس رندرشده (شامل overscan) */
  end: number;
  /** ارتفاع فاصله‌گذار بالای پنجره (px) */
  topPad: number;
  /** ارتفاع فاصله‌گذار پایین پنجره (px) */
  bottomPad: number;
  /** ارتفاع کل فهرست = مجموع ارتفاع همهٔ ردیف‌ها (px) — عین هندسهٔ اسکرول‌بار */
  totalHeight: number;
}

/**
 * محاسبهٔ پنجرهٔ رندر — همهٔ ارتفاع‌ها از آرایهٔ اندازه‌گیری‌شده؛
 * خانه‌های تهی/نا معتبر = DEFAULT_ROW_HEIGHT.
 */
export function computeVirtualWindow(params: {
  count: number;
  scrollTop: number;
  viewportHeight: number;
  heights?: ArrayLike<number | undefined>;
  defaultRowHeight?: number;
  overscan?: number;
}): VirtualWindow {
  const { count, heights } = params;
  const defaultRowHeight = params.defaultRowHeight ?? DEFAULT_ROW_HEIGHT;
  const overscan = params.overscan ?? OVERSCAN_ROWS;
  // تا پیش از اندازه‌گیری ظرف، دیدِ حدسی (پس از mount بلافاصله تصحیح می‌شود)
  const viewportHeight = params.viewportHeight > 0 ? params.viewportHeight : DEFAULT_VIEWPORT_HEIGHT;
  const scrollTop = Math.max(0, params.scrollTop);

  const heightOf = (i: number): number => {
    const h = heights?.[i];
    return typeof h === "number" && h > 0 ? h : defaultRowHeight;
  };

  // جبههٔ تجمعی: prefix[i] = مجموع ارتفاع ردیف‌های ۰..i-1
  const prefix = new Array<number>(count + 1);
  prefix[0] = 0;
  for (let i = 0; i < count; i += 1) prefix[i + 1] = prefix[i] + heightOf(i);
  const totalHeight = prefix[count];

  if (count === 0) {
    return { start: 0, end: 0, topPad: 0, bottomPad: 0, totalHeight: 0 };
  }

  // نخستین ردیفی که کف آن در محدودهٔ دید است (جست‌وجوی دودویی روی prefix)
  // پیش‌فرض = آخرین ردیف (اگر اسکرول از انتهای فهرست گذشته باشد — دفاعی)
  let start = count - 1;
  let lo = 0;
  let hi = count - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (prefix[mid + 1] <= scrollTop) lo = mid + 1;
    else {
      start = mid;
      hi = mid - 1;
    }
  }
  // آخرین ردیفی که سقف آن هنوز در دید است
  let end = start;
  const viewBottom = scrollTop + viewportHeight;
  while (end < count && prefix[end] < viewBottom) end += 1;

  // overscan با ترتیب کلاه‌برداری‌ناپذیر (clamp)
  const startFinal = Math.max(0, start - overscan);
  const endFinal = Math.min(count, end + overscan);

  return {
    start: startFinal,
    end: endFinal,
    topPad: prefix[startFinal],
    bottomPad: Math.max(0, totalHeight - prefix[endFinal]),
    totalHeight,
  };
}
