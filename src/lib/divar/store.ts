/**
 * لایه ذخیره‌سازی دیوار — اتصال‌ها (رمزنگاری‌شده) و تنظیمات ایجنت
 */

import { db } from "@/lib/db";
import { encryptSecret, decryptSecret } from "@/lib/auth/crypto";
import { DIVAR_DEFAULT_SETTINGS, type DivarSettings } from "./config";
import { DEFAULT_LOCATION_AREA_IDS } from "./tabriz-locations";
import { kenarTestKey, divarVerifyCode, type KenarPost } from "./client";

// ===================== اتصال‌ها =====================

export interface DivarConnectionStatus {
  method: "kenar" | "phone";
  status: "connected" | "disconnected" | "pending" | "error";
  phone: string | null;
  displayName: string | null;
  hasToken: boolean;
  lastCheckedAt: string | null;
  lastError: string | null;
}

async function upsert(method: "kenar" | "phone", data: Record<string, unknown>) {
  await db.divarConnection.upsert({
    where: { method },
    create: { method, ...data },
    update: data,
  });
}

/** وضعیت هر دو روش اتصال */
export async function getConnectionStatuses(): Promise<DivarConnectionStatus[]> {
  const rows = await db.divarConnection.findMany();
  const kenar = rows.find((r) => r.method === "kenar");
  const phone = rows.find((r) => r.method === "phone");
  const map = (r: typeof rows[number] | undefined, method: "kenar" | "phone"): DivarConnectionStatus => ({
    method,
    status: (r?.status as DivarConnectionStatus["status"]) ?? "disconnected",
    phone: r?.phone ?? null,
    displayName: r?.displayName ?? null,
    hasToken: Boolean(r?.tokenEnc || r?.apiKeyEnc),
    lastCheckedAt: r?.lastCheckedAt?.toISOString() ?? null,
    lastError: r?.lastError ?? null,
  });
  return [map(kenar, "kenar"), map(phone, "phone")];
}

/** ذخیره کلید کنار + آزمون زنده */
export async function saveKenarKey(apiKey: string): Promise<{ ok: boolean; message: string }> {
  const key = apiKey.trim();
  if (key.length < 10 || key.length > 200) {
    return { ok: false, message: "کلید API کنار باید بین ۱۰ تا ۲۰۰ نویسه باشد." };
  }
  const test = await kenarTestKey(key);
  await upsert("kenar", {
    status: test.ok ? "connected" : "error",
    apiKeyEnc: encryptSecret(key),
    lastCheckedAt: new Date(),
    lastError: test.ok ? null : test.message,
  });
  return test;
}

/** شروع اتصال پیامکی — درخواست کد از دیوار برای موبایل کاربر */
export async function startPhoneAuth(phone: string): Promise<{ ok: boolean; message: string }> {
  const normalized = phone.replace(/\D/g, "");
  if (!/^09\d{9}$/.test(normalized)) {
    return { ok: false, message: "شماره موبایل باید با ۰۹ شروع شده و ۱۱ رقم باشد." };
  }
  await upsert("phone", {
    status: "pending",
    phone: normalized,
    lastError: null,
  });
  return { ok: true, message: "درخواست کد پیامکی دیوار ثبت شد — گام تأیید کد را انجام دهید." };
}

/** تکمیل اتصال پیامکی — تأیید کد و ذخیره توکن نشست دیوار */
export async function completePhoneAuth(phone: string, code: string): Promise<{ ok: boolean; message: string }> {
  const normalized = phone.replace(/\D/g, "");
  const digits = code.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/\D/g, "");
  if (!/^09\d{9}$/.test(normalized)) {
    return { ok: false, message: "شماره موبایل نامعتبر است." };
  }
  if (digits.length < 4 || digits.length > 8) {
    return { ok: false, message: "کد پیامکی دیوار باید ۴ تا ۸ رقم باشد." };
  }
  try {
    const { token } = await divarVerifyCode(normalized, digits);
    await upsert("phone", {
      status: "connected",
      phone: normalized,
      tokenEnc: encryptSecret(token),
      lastCheckedAt: new Date(),
      lastError: null,
    });
    return { ok: true, message: "اتصال پیامکی دیوار برقرار شد." };
  } catch (err) {
    const message = (err as Error).message ?? "تأیید کد ناموفق بود.";
    await upsert("phone", { status: "error", phone: normalized, lastError: message });
    return { ok: false, message };
  }
}

/** کلید ریست هر روش — حذف کامل اعتبارنامه همان روش */
export async function resetConnection(method: "kenar" | "phone"): Promise<void> {
  await db.divarConnection.deleteMany({ where: { method } });
}

export async function readKenarKey(): Promise<string | null> {
  const row = await db.divarConnection.findUnique({ where: { method: "kenar" } });
  return decryptSecret(row?.apiKeyEnc ?? null);
}

// ===================== تنظیمات ایجنت =====================

const SETTINGS_ID = "singleton";

/** پاک‌سازی/حذف تکرار آرایه شناسه‌ها */
function cleanIds(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  return [...new Set(arr.filter((x): x is string => typeof x === "string" && x.length > 0))].slice(0, 926);
}

export async function loadDivarSettings(): Promise<DivarSettings> {
  const row = await db.divarSetting.findUnique({ where: { id: SETTINGS_ID } });
  if (!row) {
    await db.divarSetting.create({
      data: { id: SETTINGS_ID, dataJson: JSON.stringify({ ...DIVAR_DEFAULT_SETTINGS, scoringV3Init: true }), locFilterInit: true },
    });
    return { ...DIVAR_DEFAULT_SETTINGS, areaIds: [...DEFAULT_LOCATION_AREA_IDS], lineIds: [] };
  }
  let parsed: Partial<DivarSettings> = {};
  try {
    parsed = JSON.parse(row.dataJson) as Partial<DivarSettings>;
  } catch {
    parsed = {};
  }
  // مهاجرت یک‌بارة فیلتر مکان: نصب‌های پیشین (بدون انتخاب مکانی) ۱۷ منطقة پیش‌فرض مالک را می‌گیرند.
  // پس از آن، «خالی» همیشه یعنی انتخاب آگاهانه «همه تبریز» و دیگر بازنمی‌گردد.
  if (!row.locFilterInit) {
    const merged = { ...DIVAR_DEFAULT_SETTINGS, ...parsed };
    if (!Array.isArray(parsed.areaIds) || parsed.areaIds.length === 0) {
      merged.areaIds = [...DEFAULT_LOCATION_AREA_IDS];
    }
    if (!Array.isArray(parsed.lineIds)) merged.lineIds = [];
    await db.divarSetting
      .update({
        where: { id: SETTINGS_ID },
        data: { dataJson: JSON.stringify(merged), locFilterInit: true },
      })
      .catch(() => undefined);
    parsed = merged;
  }
  // مهاجرت یک‌بارة قوانین امتیازدهی نسخه ۲ مالک (۵۰/۲۵/۲۵ + رد کامل غیرشخصی‌ها):
  // وزن «مکان» از امتیاز حذف شد (مکان = فیلتر است) و «سایر فاکتورهای فایل بهینه» جانشین شد.
  if (!(parsed as { scoringV2Init?: boolean }).scoringV2Init && !parsed.scoringV3Init) {
    const merged = { ...DIVAR_DEFAULT_SETTINGS, ...parsed };
    merged.weightPersonal = 50;
    merged.weightUnderprice = 25;
    merged.weightOther = 25;
    delete (merged as Partial<DivarSettings> & { weightLocation?: number }).weightLocation;
    (merged as { scoringV2Init?: boolean }).scoringV2Init = true;
    await db.divarSetting
      .update({
        where: { id: SETTINGS_ID },
        data: { dataJson: JSON.stringify(merged) },
      })
      .catch(() => undefined);
    parsed = merged;
  }
  // مهاجرت یک‌بارة قوانین امتیازدهی نسخه ۳ مالک (۵۰/۲۰/۲۰/۱۰):
  // «سایر فاکتورهای فایل بهینه» (شاهکار ایجنت) و «تطبیق مکان با تنظیمات مکان کاربر» هر دو وزن مستقل گرفتند؛
  // چهار وزن جمع = ۱۰۰ و هر چهار از تنظیمات ایجنت قابل تنظیم‌اند.
  if (!parsed.scoringV3Init) {
    const merged = { ...DIVAR_DEFAULT_SETTINGS, ...parsed };
    merged.weightPersonal = DIVAR_DEFAULT_SETTINGS.weightPersonal;
    merged.weightUnderprice = DIVAR_DEFAULT_SETTINGS.weightUnderprice;
    merged.weightOther = DIVAR_DEFAULT_SETTINGS.weightOther;
    merged.weightLocation = DIVAR_DEFAULT_SETTINGS.weightLocation;
    delete (merged as Partial<DivarSettings> & { scoringV2Init?: boolean }).scoringV2Init;
    merged.scoringV3Init = true;
    await db.divarSetting
      .update({
        where: { id: SETTINGS_ID },
        data: { dataJson: JSON.stringify(merged) },
      })
      .catch(() => undefined);
    parsed = merged;
  }
  const result: DivarSettings = {
    ...DIVAR_DEFAULT_SETTINGS,
    ...parsed,
    areaIds: Array.isArray(parsed.areaIds) ? cleanIds(parsed.areaIds) : [...DEFAULT_LOCATION_AREA_IDS],
    lineIds: Array.isArray(parsed.lineIds) ? cleanIds(parsed.lineIds) : [],
  };
  return result;
}

export async function saveDivarSettings(patch: Partial<DivarSettings>): Promise<DivarSettings> {
  const current = await loadDivarSettings();
  const next: DivarSettings = {
    ...current,
    ...patch,
    areaIds: cleanIds(patch.areaIds ?? current.areaIds),
    lineIds: cleanIds(patch.lineIds ?? current.lineIds),
    weightPersonal: clamp(patch.weightPersonal ?? current.weightPersonal, 0, 100),
    weightUnderprice: clamp(patch.weightUnderprice ?? current.weightUnderprice, 0, 100),
    weightOther: clamp(patch.weightOther ?? current.weightOther, 0, 100),
    weightLocation: clamp(patch.weightLocation ?? current.weightLocation, 0, 100),
    scoringV3Init: true,
    huntThreshold: clamp(patch.huntThreshold ?? current.huntThreshold, 2, 99),
    followThreshold: clamp(patch.followThreshold ?? current.followThreshold, 1, 98),
    autoScanMinutes: clamp(patch.autoScanMinutes ?? current.autoScanMinutes, 0, 240),
    maxScanPages: clamp(patch.maxScanPages ?? current.maxScanPages, 1, 10),
    minMarketSample: clamp(patch.minMarketSample ?? current.minMarketSample, 2, 30),
    armPriceWeight: clamp(patch.armPriceWeight ?? current.armPriceWeight, 0, 0.9),
  };
  // اعتبارسنجی منطقی: شکار > پیگیری
  if (next.followThreshold >= next.huntThreshold) {
    next.followThreshold = Math.max(1, next.huntThreshold - 1);
  }
  await db.divarSetting.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, dataJson: JSON.stringify(next) },
    update: { dataJson: JSON.stringify(next) },
  });
  return next;
}

function clamp(n: number, min: number, max: number): number {
  if (!isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

// ===================== کمکی: نگاشت آگهی کنار به ردیف استاندارد =====================

export function kenarPostToFields(post: KenarPost): { businessName: string | null; isBusiness: boolean; firstPublishedAt: string | null } {
  const biz = (post as { business_data?: { business_name?: string; business_type?: string } }).business_data;
  return {
    businessName: biz?.business_name ?? null,
    isBusiness: Boolean(biz?.business_name || biz?.business_type),
    firstPublishedAt: post.firstPublishedAt ?? null,
  };
}
