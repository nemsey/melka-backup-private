/**
 * نمای کلّی لایهٔ اتصال — PN-029 (شورا-ن۰۳۳)
 * ---------------------------------------------------------------------------
 * تجمیع‌گر سبک برای روت‌های نمایش وضعیت اتصال: فیوزهای قطع‌کننده + IP کانتینر
 * + پرچم حالت آفلینی. هدف: روت‌ها از @/lib/db خالص بمانند (گارد P2-03 —
 * خلوص import روت‌ها) و هر دسترسی DB در لایهٔ کتابخانه متمرکز شود.
 */

import { isArmOfflineMode } from "./offline-mode";
import { breakerKeyFromBaseUrl, getBreakerSnapshot, type BreakerSnapshot } from "./circuit-breaker";
import { getMelkApiConfig } from "./config";
import { containerIpStatus } from "./container-ip";
import { proxyStatus } from "./proxy";
import { relayConfigStatus } from "./relay";

export interface CircuitBreakerView {
  target: string;
  consecutiveFailures: number;
  lockUntil: string | null;
  nextAttemptAt: string | null;
  locked: boolean;
  cooling: boolean;
}

export interface ConnectionOverview {
  offlineMode: boolean;
  circuitBreakers: CircuitBreakerView[];
  containerIp: Awaited<ReturnType<typeof containerIpStatus>>;
  /** PN-030 (شورا-ن۰۳۵) — وضعیت لایهٔ پروکسی عبوری ابری */
  proxy: { configured: boolean; host: string | null; secretConfigured: boolean; relayMode: string };
  /** PN-031 (شورا-ن۰۳۷) — وضعیت رلهٔ موبایل ایرانی (فقط پیکربندی — بدون راز) */
  relay: { mode: string; active: boolean };
}

/** نمای کلّی برای روت وضعیت اتصال — دسترسی DB فقط همین‌جا (خلوص روت‌ها) */
export async function getConnectionOverview(): Promise<ConnectionOverview> {
  const cfg = getMelkApiConfig();
  const targets = Array.from(
    new Set([
      breakerKeyFromBaseUrl(cfg.armApiBase),
      breakerKeyFromBaseUrl(cfg.armPublicApiBase),
      breakerKeyFromBaseUrl(cfg.pmApiBase),
      breakerKeyFromBaseUrl(cfg.gapApiBase),
      breakerKeyFromBaseUrl(cfg.melkPublicApiBase),
    ])
  );
  const snapshots = (await Promise.all(targets.map((t) => getBreakerSnapshot(t)))).filter(
    (s): s is BreakerSnapshot => s !== null
  );
  const now = Date.now();
  const circuitBreakers: CircuitBreakerView[] = snapshots.map((s) => ({
    target: s.target,
    consecutiveFailures: s.consecutiveFailures,
    lockUntil: s.lockUntil?.toISOString() ?? null,
    nextAttemptAt: s.nextAttemptAt?.toISOString() ?? null,
    locked: (s.lockUntil ? s.lockUntil.getTime() : 0) > now,
    cooling: (!s.lockUntil || s.lockUntil.getTime() <= now) && (s.nextAttemptAt ? s.nextAttemptAt.getTime() : 0) > now,
  }));

  const { db } = await import("@/lib/db");
  const containerIp = await containerIpStatus(db);

  return {
    offlineMode: isArmOfflineMode(),
    circuitBreakers,
    containerIp,
    proxy: proxyStatus(),
    relay: relayConfigStatus(),
  };
}
