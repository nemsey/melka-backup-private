/**
 * گارد IP کانتینر — PN-029 (مرحلهٔ ۷ سند شورا-ن۰۳۳)
 * ---------------------------------------------------------------------------
 * «هر ۶ ساعت، IP کانتینر در AuditLog ثبت شود؛ جداول: ContainerIpLog؛
 * نمایش در تنظیمات.»
 *
 * چرا مهم است: از PN-008 تا PN-024 هفت ریست پلتفرم رخ داد و هر ریست ممکن
 * است IP عمومی کانتینر را عوض کند. اگر ملک تبریز IP قبلی را در allow-list
 * داشته باشد، IP تازه بلاک می‌شود (ریشهٔ احتمالی «الف» — ۵۰۲ جای ۴۰۳).
 * این گارد، تغییر IP را شفاف و قابل استناد (برای تماس مالک با ملک تبریز)
 * ثبت می‌کند.
 *
 * نکته: تشخیص IP از ifconfig.me / api.ipify.org انجام می‌شود — این دو
 * میزبان، سامانه‌های ملک تبریز نیستند و در حالت آفلینی نیز مجازند
 * (خود سند شورا آزمون ۵ را خواسته است).
 */

import type { PrismaClient } from "@prisma/client";

/** فاصلهٔ ثبت ادواری — ۶ ساعت (مصوب مرحلهٔ ۷) */
export const IP_LOG_INTERVAL_MS = 6 * 60 * 60 * 1000;
/** مهلت تک‌سنجش IP */
const IP_PROBE_TIMEOUT_MS = 8_000;

/** نتیجهٔ تشخیص IP */
export interface ContainerIpInfo {
  ip: string | null;
  source: string;
  detectedAt: string;
  /** آخرین IP ثبت‌شدهٔ پیش از این (برای مقایسه) */
  previousIp: string | null;
  changed: boolean;
}

/** تشخیص IP عمومی کانتینر — خام و بدون گارد آفلاین (میزبان غیرملک‌تبریزی) */
export async function detectContainerIp(): Promise<{ ip: string | null; source: string }> {
  const probe = async (url: string, source: string): Promise<string | null> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), IP_PROBE_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
      const text = (await res.text()).trim();
      // اعتبارسنجی ساده: IPv4/IPv6
      if (/^[0-9a-fA-F.:]{7,45}$/.test(text) && text.includes(".")) return text;
      return null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };
  const primary = await probe("https://ifconfig.me", "ifconfig.me");
  if (primary) return { ip: primary, source: "ifconfig.me" };
  const secondary = await probe("https://api.ipify.org", "api.ipify.org");
  if (secondary) return { ip: secondary, source: "api.ipify.org" };
  return { ip: null, source: "none" };
}

/** آخرین IP ثبت‌شده در دیتابیس (یا null) */
export async function lastLoggedIp(db: PrismaClient): Promise<string | null> {
  try {
    const last = await db.containerIpLog.findFirst({ orderBy: { detectedAt: "desc" } });
    return last?.ip ?? null;
  } catch {
    return null; // fail-open
  }
}

/**
 * ثبت IP جاری + AuditLog — کار ادواری Worker (هر ۶ ساعت).
 * تغییر IP با شاهد صریح ثبت می‌شود (سرنخ ریشهٔ «الف»).
 */
export async function recordContainerIp(db: PrismaClient): Promise<ContainerIpInfo> {
  const { ip, source } = await detectContainerIp();
  const previousIp = await lastLoggedIp(db);
  const changed = ip !== null && previousIp !== null && ip !== previousIp;
  const detectedAt = new Date().toISOString();

  if (ip) {
    try {
      await db.containerIpLog.create({ data: { ip, source, changed } });
      await db.auditLog.create({
        data: {
          action: "CONTAINER_IP_LOG",
          actor: "worker:ip-log",
          detail: JSON.stringify({ ip, source, changed, previousIp, note: "PN-029 مرحلهٔ ۷ — گارد IP کانتینر" }),
        },
      });
    } catch {
      // ثبت شاهد بهترین-تلاش است — هرگز کار را نمی‌شکند
    }
  }

  return { ip, source, detectedAt, previousIp, changed };
}

/** وضعیت برای نمایش در تنظیمات — خواندن آخرین دو رکورد */
export async function containerIpStatus(db: PrismaClient): Promise<{
  currentIp: string | null;
  source: string | null;
  detectedAt: string | null;
  changed: boolean;
  historyCount: number;
}> {
  try {
    const [last, count] = await Promise.all([
      db.containerIpLog.findFirst({ orderBy: { detectedAt: "desc" } }),
      db.containerIpLog.count(),
    ]);
    return {
      currentIp: last?.ip ?? null,
      source: last?.source ?? null,
      detectedAt: last?.detectedAt?.toISOString() ?? null,
      changed: last?.changed ?? false,
      historyCount: count,
    };
  } catch {
    return { currentIp: null, source: null, detectedAt: null, changed: false, historyCount: 0 };
  }
}
