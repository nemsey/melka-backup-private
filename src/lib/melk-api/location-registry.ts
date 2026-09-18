/**
 * رجیستری مکان پیش‌فرض — P6.5-04-c (دستور شورا P6.5-04)
 * =====================================================
 * منبع: src/lib/divar/tabriz-locations.data.json — ۱۳۰ منطقه × ۹۲۶ محله ARM
 * (موجود از PHASE 2؛ راستی‌آزمایی‌شده در P6.5-00).
 *
 * الگوی بارگذاری عین دستور: «lazy + cache در حافظه» — بار اول نمایه ساخته می‌شود،
 * فراخوانی‌های بعدی همان نمونه کش‌شده را برمی‌گردانند (صفر I/O شبکه — import ایستای JSON).
 *
 * مرز: این ماژول فقط داده ایستا می‌خواند؛ صفر Prisma، صفر fetch، صفر React.
 */
import { TABRIZ_AREAS } from "@/lib/divar/tabriz-locations";
import {
  buildLocationRegistry,
  type LocationEntry,
  type LocationMatch,
  type LocationRegistry,
} from "./normalize";

/** مدخل‌های رجیستری — ۱۳۰ منطقه + ۹۲۶ محله = ۱۰۵۶ مدخل جستجو */
function buildDefaultEntries(): LocationEntry[] {
  const entries: LocationEntry[] = [];
  for (const area of TABRIZ_AREAS) {
    const areaName = area.n.trim();
    entries.push({ id: area.id, name: areaName, kind: "area", areaId: area.id, areaName });
    for (const line of area.l) {
      entries.push({
        id: line.id,
        name: line.n.trim(),
        kind: "line",
        areaId: area.id,
        areaName,
      });
    }
  }
  return entries;
}

let cached: LocationRegistry | null = null;

/** رجیستری پیش‌فرض — lazy + cache (عین دستور P6.5-04-c اقدام ۱ و ۲) */
export function getDefaultLocationRegistry(): LocationRegistry {
  if (cached) return cached;
  cached = buildLocationRegistry(buildDefaultEntries());
  return cached;
}

/** بازنشانی کش — فقط برای تست‌های واحد (تولید هرگز صدا نمی‌زند) */
export function resetDefaultLocationRegistry(): void {
  cached = null;
}

/**
 * جست‌وجوی محله/منطقه با نام — عین امضای دستور P6.5-04-c اقدام ۳:
 * findLocationByName(raw): LocationMatch | null (روی رجیستری پیش‌فرض)
 */
export function findLocationByName(raw: string): LocationMatch | null {
  const registry = getDefaultLocationRegistry();
  const { findLocationInRegistry } = require("./normalize") as typeof import("./normalize");
  return findLocationInRegistry(raw, registry);
}

/** شمارش مدخل‌ها برای شاهد/گزارش — بدون لمس کش در صورت نبود */
export function defaultRegistrySize(): number {
  return getDefaultLocationRegistry().entries.length;
}
