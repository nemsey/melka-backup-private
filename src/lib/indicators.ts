/**
 * نشانگرهای اتصال — ده چراغ سبز/قرمز بالای صفحه خانه
 * ------------------------------------------------------
 * ۱. حساب شخصی سامانه ARM  — نشست دارای توکن آرم (ورود با کد پرسنلی + پیامک)
 * ۲. API سامانه ARM        — در دسترس بودن arus-api (کش ۶۰ ثانیه)
 * ۳. حساب شخصی سامانه PM   — اتصال ثبت‌شده PM (کد پرسنلی + پیامک از تنظیمات)
 * ۴. API سامانه PM         — در دسترس بودن pm-api (کش ۶۰ ثانیه)
 * ۵. سامانه عمومی ملک تبریز — API عمومی apu (melketabriz.com) — P6546/گام صفر
 * ۶. حساب شخصی سامانه GAP  — اتصال ثبت‌شده سامانه گفت‌وگو — P6546/گام صفر
 * ۷. API سامانه GAP        — در دسترس بودن gap-api — P6546/گام صفر
 * ۸. API دیوار             — کنار متصل یا API وب دیوار در دسترس
 * ۹. حساب شخصی دیوار       — اتصال پیامکی دیوار (توکن)
 * ۱۰. حساب اینستاگرام      — توکن Graph API معتبر
 */

import { db } from "@/lib/db";
import { probeGet } from "@/lib/melk-api/client";
import { getMelkApiConfig } from "@/lib/melk-api/config";
import { decryptSecret } from "@/lib/auth/crypto";

export type IndicatorKey =
  | "armAccount"
  | "armApi"
  | "pmAccount"
  | "pmApi"
  | "melkPublicApi"
  | "gapApi"
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

async function cachedProbe(key: string, baseUrl: string, path: string, okDetail: string, failDetail: string): Promise<ProbeCache> {
  const hit = probeCache.get(key);
  if (hit && Date.now() - hit.at < PROBE_TTL_MS) return hit;
  const cfg = getMelkApiConfig();
  const probe = await probeGet(baseUrl, path, Math.min(cfg.timeoutMs, 9000));
  const result: ProbeCache = {
    at: Date.now(),
    ok: probe.httpStatus > 0 && probe.httpStatus < 500 && !probe.bodyText.includes("MongooseError"),
    detail: probe.ok ? okDetail : failDetail,
  };
  probeCache.set(key, result);
  return result;
}

// ===================== سنجش دیوار =====================

async function probeDivar(): Promise<ProbeCache> {
  const hit = probeCache.get("divarApi");
  if (hit && Date.now() - hit.at < PROBE_TTL_MS) return hit;
  const cfg = getMelkApiConfig();
  void cfg;
  // سنجش API جستجوی وب دیوار (مسیر داده‌ای فایل‌یابی)
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
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
  const kenar = await db.divarConnection.findUnique({ where: { method: "kenar" } });
  const kenarConnected = kenar?.status === "connected";
  const result: ProbeCache = {
    at: Date.now(),
    ok: ok || kenarConnected,
    detail: kenarConnected ? "کنار (API رسمی دیوار) متصل است" : ok ? "API وب دیوار پاسخ می‌دهد" : "API دیوار در دسترس نیست",
  };
  probeCache.set("divarApi", result);
  return result;
}

// ===================== محاسبه هر ۷ نشانگر =====================

export async function computeIndicators(sessionHasArmToken: boolean, sessionArmUserType?: string | null): Promise<IndicatorState[]> {
  const now = new Date().toISOString();
  const cfg = getMelkApiConfig();

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
  const armProbe = await cachedProbe(
    "armApi",
    cfg.armPublicApiBase,
    "statics/enums-persian",
    "API سامانه آرم پاسخ می‌دهد",
    "API سامانه آرم در دسترس نیست"
  ).catch(() => ({ at: Date.now(), ok: false, detail: "API سامانه آرم در دسترس نیست" }) as ProbeCache);
  const armApi: IndicatorState = {
    key: "armApi",
    label: "API سامانه ARM",
    connected: armProbe.ok,
    detail: armProbe.detail,
    checkedAt: new Date(armProbe.at).toISOString(),
  };

  // ۳. حساب شخصی PM
  const pmConn = await db.pmConnection.findFirst().catch(() => null);
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
  const pmProbe = await cachedProbe("pmApi", cfg.pmApiBase, "public/portalInfo", "API سامانه پرسنلی پاسخ می‌دهد", "API سامانه پرسنلی در دسترس نیست").catch(
    () => ({ at: Date.now(), ok: false, detail: "API سامانه پرسنلی در دسترس نیست" }) as ProbeCache
  );
  const pmApi: IndicatorState = {
    key: "pmApi",
    label: "API سامانه PM",
    connected: pmProbe.ok,
    detail: pmProbe.detail,
    checkedAt: new Date(pmProbe.at).toISOString(),
  };

  // ۵. سامانه عمومی ملک تبریز (P6546) — API عمومی apu که melketabriz.com از آن می‌خواند
  const melkPublicProbe = await cachedProbe(
    "melkPublicApi",
    cfg.melkPublicApiBase,
    "properties/list?page=1&limit=1",
    "API عمومی سامانه ملک تبریز (melketabriz.com) پاسخ می‌دهد",
    "API عمومی سامانه ملک تبریز (melketabriz.com) در دسترس نیست"
  ).catch(() => ({ at: Date.now(), ok: false, detail: "API عمومی سامانه ملک تبریز (melketabriz.com) در دسترس نیست" }) as ProbeCache);
  const melkPublicApi: IndicatorState = {
    key: "melkPublicApi",
    label: "سامانه عمومی ملک تبریز",
    connected: melkPublicProbe.ok,
    detail: melkPublicProbe.detail,
    checkedAt: new Date(melkPublicProbe.at).toISOString(),
  };


  // ۷. API سامانه GAP (P6546) — gap-api زنده است (پاسخ HTTP هر نوعی = در دسترس)
  const gapProbe = await probeGet(cfg.gapApiBase, "", Math.min(cfg.timeoutMs, 9000)).catch(() => ({
    httpStatus: 0,
    bodyText: "",
    ok: false,
    latencyMs: 0,
  }));
  const gapApi: IndicatorState = {
    key: "gapApi",
    label: "API سامانه GAP",
    connected: gapProbe.httpStatus > 0,
    detail: gapProbe.httpStatus > 0 ? `سرور gap-api پاسخ می‌دهد (HTTP ${gapProbe.httpStatus})` : "سرور gap-api.melketabriz.ir در دسترس نیست",
    checkedAt: now,
  };

  // ۸. API دیوار
  const divarProbe = await probeDivar().catch(() => ({ at: Date.now(), ok: false, detail: "API دیوار در دسترس نیست" }) as ProbeCache);
  const divarApi: IndicatorState = {
    key: "divarApi",
    label: "API دیوار",
    connected: divarProbe.ok,
    detail: divarProbe.detail,
    checkedAt: new Date(divarProbe.at).toISOString(),
  };

  // ۹. حساب شخصی دیوار
  const divarPhone = await db.divarConnection.findUnique({ where: { method: "phone" } }).catch(() => null);
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
  const igConn = await db.instagramConnection.findFirst().catch(() => null);
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

  return [armAccount, armApi, pmAccount, pmApi, melkPublicApi, gapApi, divarApi, divarAccount, instagramAccount];
}
