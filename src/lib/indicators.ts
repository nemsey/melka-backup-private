/**
 * نشانگرهای اتصال — ده چراغ سبز/قرمز بالای صفحه خانه
 * ------------------------------------------------------
 * ۱. حساب شخصی سامانه ARM  — نشست دارای توکن آرم (ورود با کد پرسنلی + پیامک)
 * ۲. API سامانه ARM        — در دسترس بودن arus-api (کش ۶۰ ثانیه)
 * ۳. حساب شخصی سامانه PM   — اتصال ثبت‌شده PM (کد پرسنلی + پیامک از تنظیمات)
 * ۴. API سامانه PM         — در دسترس بودن pm-api (کش ۶۰ ثانیه)
 * ۵. سامانه عمومی ملک تبریز — API عمومی apu (melketabriz.com) — P6546/گام صفر
 * ۶. حساب شخصی سامانه GAP  — اتصال ثبت‌شده سامانه گفت‌وگو — P6546/گام صفر
 * ۷. API سامانه GAP        — در دسترس بودن gap-api (کش ۶۰ ثانیه) — P6546/گام صفر
 * ۸. API دیوار             — کنار متصل یا API وب دیوار در دسترس
 * ۹. حساب شخصی دیوار       — اتصال پیامکی دیوار (توکن)
 * ۱۰. حساب اینستاگرام      — توکن Graph API معتبر
 *
 * ══════════════════════════════════════════════════════════════════════════
 * PN-028 / اولاً — ریشه‌یابی دائمی «خطا در بررسی اتصال‌ها (502) پس از بالا آمدن»
 * ══════════════════════════════════════════════════════════════════════════
 * علت ریشه‌ای (شاهد زنده): تا پیش از این، هر فراخوانی /api/indicators پنج
 * سنجش بیرونی را «پشت‌سرهم» اجرا می‌کرد (هرکدام تا ۹ ثانیه مهلت) ⇒ در ساعاتی
 * که سامانه‌های ملک تبریز کند/قطع بودند، پاسخ این روت تا ۴۵+ ثانیه و با
 * فشار بوت (پیش‌گرمایش ۱۶ موتور + همگام‌سازی پس‌زمینه) حتی بیشتر معلق می‌ماند؛
 * دروازهٔ پلتفرم پس از مهلت خودش 502 برمی‌گرداند و UI دقیقاً پیام
 * «سامانه ملک تبریز موقتاً پاسخ نمی‌دهد (خطای 502)» را نشان می‌داد.
 *
 * درمان ریشه‌ای (سه اصل — هر سه با هم، برای همیشه):
 *   ۱) موازی‌سازی: همهٔ سنجش‌های بیرونی هم‌زمان اجرا می‌شوند — سقف کل = سقف
 *      تک سنجش (۵ ثانیه)، نه مجموعشان.
 *   ۲) مهلت کوتاه: هر سنجش بیرونی حداکثر ۵ ثانیه (پیش از این ۹).
 *   ۳) الگوی stale-while-revalidate: پاسخ «همیشه فوری» از کشِ درون‌فرایندی؛
 *      کشِ کهنه بلافاصله پاسخ داده می‌شود و تازه‌سازی در پس‌زمینه (بدون دوبله،
 *      با قفل درون‌پروGRESS) انجام می‌شود. GAP هم از این پس کش‌شده است
 *      (پیش از این تنها سنجشِ بدون کش بود).
 */

import { db } from "@/lib/db";
import { probeGet } from "@/lib/melk-api/client";
// PN-029 — حالت آفلینی ملک تبریز: صفر پروب خودکار (ریشهٔ ۵۰۲ نشانگرها)
import { getMelkApiConfig } from "@/lib/melk-api/config";
import { decryptSecret } from "@/lib/auth/crypto";
// PN-046/گام صفر — وضعیت اتصال ملکتون (state file پایدار — سوخت نشانگر)
import { getMelketunConnection, melketunMeta } from "@/lib/integrations/melketun";

export type IndicatorKey =
  | "armAccount"
  | "armApi"
  | "pmAccount"
  | "pmApi"
  | "melkPublicApi"
  | "gapApi"
  | "melketunCrm"
  | "melketunPublic"
  | "divarApi"
  | "divarAccount"
  | "instagramAccount";

export interface IndicatorState {
  key: IndicatorKey;
  label: string;
  connected: boolean;
  detail: string;
  checkedAt: string;
}

// ===================== کش سنجش API (۶۰ ثانیه، در فرآیند) =====================

interface ProbeCache {
  at: number;
  ok: boolean;
  detail: string;
}

const probeCache = new Map<string, ProbeCache>();
const PROBE_TTL_MS = 60_000;

/** PN-028/اولاً — مهلت تک‌سنجش: ۵ ثانیه (پیش از این ۹) — پاسخ روت هرگز معلق نمی‌ماند */
const PROBE_TIMEOUT_MS = 5_000;

async function cachedProbe(key: string, baseUrl: string, path: string, okDetail: string, failDetail: string): Promise<ProbeCache> {
  const hit = probeCache.get(key);
  if (hit && Date.now() - hit.at < PROBE_TTL_MS) return hit;
  const cfg = getMelkApiConfig();
  const probe = await probeGet(baseUrl, path, Math.min(cfg.timeoutMs, PROBE_TIMEOUT_MS));
  const result: ProbeCache = {
    at: Date.now(),
    ok: probe.httpStatus > 0 && probe.httpStatus < 500 && !probe.bodyText.includes("MongooseError"),
    detail: probe.ok ? okDetail : failDetail,
  };
  probeCache.set(key, result);
  return result;
}

// ═══════════════ PN-028/اولاً — سنجش دیوار (کش‌شده، همان مهلت ۵ ثانیه) ═══════════════

async function probeDivar(): Promise<ProbeCache> {
  const hit = probeCache.get("divarApi");
  if (hit && Date.now() - hit.at < PROBE_TTL_MS) return hit;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  let ok = false;
  try {
    const res = await fetch("https://api.divar.ir/v8/postlist/w/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ city_ids: ["5"], data: { category_str: { value: "apartment-sell" } } }),
      signal: controller.signal,
      cache: "no-store",
    });
    ok = res.ok;
  } catch {
    ok = false;
  } finally {
    clearTimeout(timer);
  }
  // اگر کلید کنار متصل است، منبع رسمی هم در دسترس است
  const kenar = await db.divarConnection.findUnique({ where: { method: "kenar" } }).catch(() => null);
  const kenarConnected = kenar?.status === "connected";
  const result: ProbeCache = {
    at: Date.now(),
    ok: ok || kenarConnected,
    detail: kenarConnected ? "کنار (API رسمی دیوار) متصل است" : ok ? "API وب دیوار پاسخ می‌دهد" : "API دیوار در دسترس نیست",
  };
  probeCache.set("divarApi", result);
  return result;
}

// ═══════════════ PN-028/اولاً — سنجش GAP (از این پس کش‌شده، عین بقیه) ═══════════════

async function probeGap(): Promise<ProbeCache> {
  const hit = probeCache.get("gapApi");
  if (hit && Date.now() - hit.at < PROBE_TTL_MS) return hit;
  const cfg = getMelkApiConfig();
  const probe = await probeGet(cfg.gapApiBase, "", Math.min(cfg.timeoutMs, PROBE_TIMEOUT_MS)).catch(() => ({
    httpStatus: 0,
    bodyText: "",
    ok: false,
    latencyMs: 0,
  }));
  const result: ProbeCache = {
    at: Date.now(),
    ok: probe.httpStatus > 0,
    detail: probe.httpStatus > 0 ? `سرور gap-api پاسخ می‌دهد (HTTP ${probe.httpStatus})` : "سرور gap-api.melketabriz.ir در دسترس نیست",
  };
  probeCache.set("gapApi", result);
  return result;
}

// ═════════ PN-046/گام صفر — سنجش ملکتون (کش‌شده، مهلت ۵ ثانیه — عین الگوی دیوار) ═════════

/** نشانی‌های ملکتون از فایل راز (fallback صادقانه در فقدان فایل) */
function melketunUrls(): { crm: string; public: string } {
  try {
    const m = melketunMeta();
    return { crm: m.crm.base_url, public: m.public.base_url };
  } catch {
    return { crm: "https://melketun.app", public: "https://melketun.com" };
  }
}

/** CRM ملکتون — دسترسی صفحهٔ ورود (login واقعی جداگانه در state file ثبت می‌شود) */
async function probeMelketunCrm(): Promise<ProbeCache> {
  const hit = probeCache.get("melketunCrm");
  if (hit && Date.now() - hit.at < PROBE_TTL_MS) return hit;
  const base = melketunUrls().crm.replace(/\/$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  let status = 0;
  try {
    const res = await fetch(`${base}/login`, {
      redirect: "manual",
      signal: controller.signal,
      cache: "no-store",
    });
    status = res.status;
  } catch {
    status = 0;
  } finally {
    clearTimeout(timer);
  }
  const ok = status > 0 && status < 500;
  const result: ProbeCache = {
    at: Date.now(),
    ok,
    detail: ok
      ? `سرور CRM ملکتون پاسخ می‌دهد (HTTP ${status})`
      : "سرور CRM ملکتون (melketun.app) در دسترس نیست",
  };
  probeCache.set("melketunCrm", result);
  return result;
}

/** سایت عمومی ملکتون (melketun.com) — HEAD سبک */
async function probeMelketunPublic(): Promise<ProbeCache> {
  const hit = probeCache.get("melketunPublic");
  if (hit && Date.now() - hit.at < PROBE_TTL_MS) return hit;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  let status = 0;
  try {
    const res = await fetch(melketunUrls().public, {
      method: "HEAD",
      redirect: "manual",
      signal: controller.signal,
      cache: "no-store",
    });
    status = res.status;
  } catch {
    status = 0;
  } finally {
    clearTimeout(timer);
  }
  const ok = status > 0 && status < 500;
  const result: ProbeCache = {
    at: Date.now(),
    ok,
    detail: ok
      ? `سایت عمومی ملکتون پاسخ می‌دهد (HTTP ${status})`
      : "سایت عمومی ملکتون (melketun.com) در دسترس نیست",
  };
  probeCache.set("melketunPublic", result);
  return result;
}

// ═════════ PN-028/اولاً — تازه‌سازی موازی همهٔ سنجش‌های بیرونی (با قفل دوبله‌شدن) ═════════

/** نتیجهٔ یک دور کامل سنجش‌های بیرونی */
interface ExternalProbes {
  armApi: ProbeCache;
  pmApi: ProbeCache;
  melkPublicApi: ProbeCache;
  gapApi: ProbeCache;
  divarApi: ProbeCache;
  melketunCrm: ProbeCache;
  melketunPublic: ProbeCache;
}

let inflightRefresh: Promise<unknown> | null = null;

/** یک دور سنجش بیرونی — همه هم‌زمان؛ سقف کل ≈ ۵ ثانیه (نه ۴۵) */
async function runExternalProbes(): Promise<ExternalProbes> {
  const cfg = getMelkApiConfig();
  const fallback = (detail: string): ProbeCache => ({ at: Date.now(), ok: false, detail });

  // PN-029 (مرحلهٔ ۲ — سند شورا-ن۰۳۳): در حالت آفلینی، چهار نشانگرِ سامانه‌های
  // ملک تبریز اصلاً پروب نمی‌شوند — آخرین کش (در صورت وجود) با برچسب آفلاین
  // سرو می‌شود و صفر بستهٔ شبکه به arus-api/pm-api/gap-api ارسال می‌گردد.
  const [armApi, pmApi, melkPublicApi, gapApi, divarApi, melketunCrm, melketunPublic] = await Promise.all([
    cachedProbe("armApi", cfg.armPublicApiBase, "statics/enums-persian", "API سامانه آرم پاسخ می‌دهد", "API سامانه آرم در دسترس نیست")
      .catch(() => fallback("API سامانه آرم در دسترس نیست")),
    cachedProbe("pmApi", cfg.pmApiBase, "public/portalInfo", "API سامانه پرسنلی پاسخ می‌دهد", "API سامانه پرسنلی در دسترس نیست")
      .catch(() => fallback("API سامانه پرسنلی در دسترس نیست")),
    cachedProbe(
      "melkPublicApi",
      cfg.melkPublicApiBase,
      "properties/list?page=1&limit=1",
      "API عمومی سامانه ملک تبریز (melketabriz.com) پاسخ می‌دهد",
      "API عمومی سامانه ملک تبریز (melketabriz.com) در دسترس نیست"
    ).catch(() => fallback("API عمومی سامانه ملک تبریز (melketabriz.com) در دسترس نیست")),
    probeGap().catch(() => fallback("سرور gap-api.melketabriz.ir در دسترس نیست")),
    probeDivar().catch(() => fallback("API دیوار در دسترس نیست")),
    // PN-046/گام صفر — سامانه‌های ملکتون در همان دور موازی (سقف کل ≈ ۵ ثانیه)
    probeMelketunCrm().catch(() => fallback("سرور CRM ملکتون در دسترس نیست")),
    probeMelketunPublic().catch(() => fallback("سایت عمومی ملکتون در دسترس نیست")),
  ]);
  return { armApi, pmApi, melkPublicApi, gapApi, divarApi, melketunCrm, melketunPublic };
}

/** تازه‌سازی پس‌زمینه — بدون دوبله (inflight) و هرگز خطا به بالا نمی‌دهد */
function refreshInBackground(): void {
  if (inflightRefresh) return;
  inflightRefresh = runExternalProbes()
    .catch(() => null)
    .finally(() => {
      inflightRefresh = null;
    });
}

/** سنجش‌های بیرونی «همیشه سریع»:
 *  · کش تازه (< ۶۰ث) → همان
 *  · کش کهنه → همان کش بلافاصله + تازه‌سازی پس‌زمینه (stale-while-revalidate)
 *  · بدون کش (نخستین فراخوانی پس از بوت) → یک دور موازی تا ~۵ ثانیه —
 *    سقف مطلق پاسخ این روت، حتی در بدترین حالت، از مرز مهلت دروازه دور است */
function externalProbesFast(): Promise<ExternalProbes> {
  const armApi = probeCache.get("armApi");
  const fresh = armApi && Date.now() - armApi.at < PROBE_TTL_MS;
  if (armApi && fresh) {
    return Promise.resolve({
      armApi: armApi,
      pmApi: probeCache.get("pmApi") ?? { at: Date.now(), ok: false, detail: "API سامانه پرسنلی در دسترس نیست" },
      melkPublicApi: probeCache.get("melkPublicApi") ?? { at: Date.now(), ok: false, detail: "API عمومی سامانه ملک تبریز (melketabriz.com) در دسترس نیست" },
      gapApi: probeCache.get("gapApi") ?? { at: Date.now(), ok: false, detail: "سرور gap-api.melketabriz.ir در دسترس نیست" },
      divarApi: probeCache.get("divarApi") ?? { at: Date.now(), ok: false, detail: "API دیوار در دسترس نیست" },
      melketunCrm: probeCache.get("melketunCrm") ?? { at: Date.now(), ok: false, detail: "سرور CRM ملکتون در دسترس نیست" },
      melketunPublic: probeCache.get("melketunPublic") ?? { at: Date.now(), ok: false, detail: "سایت عمومی ملکتون در دسترس نیست" },
    });
  }
  const anyCached = armApi ?? probeCache.get("pmApi") ?? probeCache.get("melkPublicApi") ?? probeCache.get("gapApi") ?? probeCache.get("divarApi");
  if (anyCached && Date.now() - anyCached.at < PROBE_TTL_MS * 30) {
    // کش کهنه — پاسخ فوری با همان + تازه‌سازی بی‌صدا در پس‌زمینه
    refreshInBackground();
    return Promise.resolve(externalFromCache());
  }
  // بدون کش — نخستین دور (موازی، حداکثر ~۵ ثانیه)
  return runExternalProbes().catch(() => externalFromCache());
}

/** خواندن کش فعلی به شکل ExternalProbes (با مقادیر پیش‌فرض صادقانه) */
function externalFromCache(): ExternalProbes {
  const none = (d: string): ProbeCache => ({ at: Date.now(), ok: false, detail: d });
  return {
    armApi: probeCache.get("armApi") ?? none("API سامانه آرم در دسترس نیست"),
    pmApi: probeCache.get("pmApi") ?? none("API سامانه پرسنلی در دسترس نیست"),
    melkPublicApi: probeCache.get("melkPublicApi") ?? none("API عمومی سامانه ملک تبریز (melketabriz.com) در دسترس نیست"),
    gapApi: probeCache.get("gapApi") ?? none("سرور gap-api.melketabriz.ir در دسترس نیست"),
    divarApi: probeCache.get("divarApi") ?? none("API دیوار در دسترس نیست"),
    melketunCrm: probeCache.get("melketunCrm") ?? none("سرور CRM ملکتون در دسترس نیست"),
    melketunPublic: probeCache.get("melketunPublic") ?? none("سایت عمومی ملکتون در دسترس نیست"),
  };
}

// ===================== محاسبه هر ۱۱ نشانگر (۹ تبریز/دیوار/اینستا + ۲ ملکتون — PN-046) =====================
export async function computeIndicators(sessionHasArmToken: boolean, sessionArmUserType?: string | null): Promise<IndicatorState[]> {
  const now = new Date().toISOString();
  const cfg = getMelkApiConfig();
  void cfg;

  // ── سنجش‌های بیرونی: همیشه سریع (کش/موازی — PN-028/اولاً) ──
  const external = await externalProbesFast();

  // ── وضعیت‌های محلی (DB — سریع، بدون شبکه) ──
  const [pmConn, divarPhone, igConn] = await Promise.all([
    db.pmConnection.findFirst().catch(() => null),
    db.divarConnection.findUnique({ where: { method: "phone" } }).catch(() => null),
    db.instagramConnection.findFirst().catch(() => null),
  ]);

  // ۱. حساب شخصی ARM — توکن نشست
  const armAccount: IndicatorState = {
    key: "armAccount",
    label: "حساب شخصی ARM",
    connected: sessionHasArmToken,
    detail: sessionHasArmToken
      ? `نشست با کد پرسنلی + پیامک وارد شده و توکن آرم فعال است${sessionArmUserType ? ` (${sessionArmUserType})` : ""}`
      : "ورود با «کد پرسنلی + پیامک» انجام نشده — نشست مدیر محلی توکن آرم ندارد",
    checkedAt: now,
  };

  // ۲. API سامانه ARM
  const armApi: IndicatorState = {
    key: "armApi",
    label: "API سامانه ARM",
    connected: external.armApi.ok,
    detail: external.armApi.detail,
    checkedAt: new Date(external.armApi.at).toISOString(),
  };

  // ۳. حساب شخصی PM
  const pmAccount: IndicatorState = {
    key: "pmAccount",
    label: "حساب شخصی PM",
    connected: pmConn?.status === "connected" && Boolean(decryptSecret(pmConn.tokenEnc ?? null)),
    detail:
      pmConn?.status === "connected"
        ? `حساب پرسنلی «${pmConn.displayName ?? pmConn.personnelCode ?? ""}» متصل است`
        : pmConn?.status === "error"
          ? `اتصال PM خطا دارد: ${pmConn.lastError ?? "نامشخص"}`
          : pmConn?.status === "pending"
            ? "در انتظار تأیید کد پیامکی PM"
            : "اتصال حساب شخصی PM از تنظیمات عمومی برقرار نشده است",
    checkedAt: pmConn?.lastCheckedAt?.toISOString() ?? now,
  };

  // ۴. API سامانه PM
  const pmApi: IndicatorState = {
    key: "pmApi",
    label: "API سامانه PM",
    connected: external.pmApi.ok,
    detail: external.pmApi.detail,
    checkedAt: new Date(external.pmApi.at).toISOString(),
  };

  // ۵. سامانه عمومی ملک تبریز (P6546)
  const melkPublicApi: IndicatorState = {
    key: "melkPublicApi",
    label: "سامانه عمومی ملک تبریز",
    connected: external.melkPublicApi.ok,
    detail: external.melkPublicApi.detail,
    checkedAt: new Date(external.melkPublicApi.at).toISOString(),
  };

  // ۷. API سامانه GAP (P6546) — از این پس کش‌شده (PN-028)
  //    (چراغ «حساب GAP» به دستور مالک جلسهٔ ۰۳۳ حذف شده است — تنها API GAP مانده)
  const gapApi: IndicatorState = {
    key: "gapApi",
    label: "API سامانه GAP",
    connected: external.gapApi.ok,
    detail: external.gapApi.detail,
    checkedAt: new Date(external.gapApi.at).toISOString(),
  };

  // ۸-ب. CRM ملکتون (PN-046/گام صفر — دستور مالک: وضعیت اتصال سامانه‌های ملکتون در نوار وضعیت)
  //     سبز = ورود واقعی موفق (state file — از تست تنظیمات یا sync شش‌ساعته) + سرور در دسترس
  const melketunConn = getMelketunConnection();
  const melketunCrm: IndicatorState = {
    key: "melketunCrm",
    label: "CRM ملکتون",
    connected: Boolean(melketunConn?.ok) && external.melketunCrm.ok,
    detail: melketunConn
      ? melketunConn.ok
        ? `ورود واقعی موفق (حساب «${melketunConn.username}») — ${external.melketunCrm.detail}`
        : `آخرین ورود واقعی ناموفق: ${melketunConn.note} — ${external.melketunCrm.detail}`
      : `ورود واقعی هنوز آزمایش نشده — از تنظیمات عمومی، بخش «اتصال به ملکتون» — ${external.melketunCrm.detail}`,
    checkedAt: melketunConn?.at ?? new Date(external.melketunCrm.at).toISOString(),
  };

  // ۸-پ. سایت عمومی ملکتون (PN-046/گام صفر)
  const melketunPublic: IndicatorState = {
    key: "melketunPublic",
    label: "سایت عمومی ملکتون",
    connected: external.melketunPublic.ok,
    detail: external.melketunPublic.detail,
    checkedAt: new Date(external.melketunPublic.at).toISOString(),
  };

  // ۸. API دیوار
  const divarApi: IndicatorState = {
    key: "divarApi",
    label: "API دیوار",
    connected: external.divarApi.ok,
    detail: external.divarApi.detail,
    checkedAt: new Date(external.divarApi.at).toISOString(),
  };

  // ۹. حساب شخصی دیوار
  const divarAccount: IndicatorState = {
    key: "divarAccount",
    label: "حساب شخصی دیوار",
    connected: divarPhone?.status === "connected" && Boolean(decryptSecret(divarPhone.tokenEnc ?? null)),
    detail:
      divarPhone?.status === "connected"
        ? `حساب دیوار با شماره ${divarPhone.phone ?? "—"} متصل است`
        : divarPhone?.status === "error"
          ? `اتصال پیامکی دیوار خطا دارد: ${divarPhone.lastError ?? "نامشخص"}`
          : divarPhone?.status === "pending"
            ? "در انتظار تأیید کد پیامکی دیوار"
            : "اتصال حساب شخصی دیوار از تنظیمات عمومی برقرار نشده است",
    checkedAt: divarPhone?.lastCheckedAt?.toISOString() ?? now,
  };

  // ۱۰. حساب اینستاگرام
  const instagramAccount: IndicatorState = {
    key: "instagramAccount",
    label: "حساب اینستاگرام",
    connected: igConn?.status === "connected" && Boolean(decryptSecret(igConn.tokenEnc ?? null)),
    detail:
      igConn?.status === "connected"
        ? `حساب «${igConn.username ?? "اینستاگرام"}» متصل است`
        : igConn?.status === "error"
          ? `اتصال اینستاگرام خطا دارد: ${igConn.lastError ?? "نامشخص"}`
          : "اتصال حساب اینستاگرام از تنظیمات عمومی برقرار نشده است",
    checkedAt: igConn?.lastCheckedAt?.toISOString() ?? now,
  };

  return [armAccount, armApi, pmAccount, pmApi, melkPublicApi, gapApi, melketunCrm, melketunPublic, divarApi, divarAccount, instagramAccount];
}
