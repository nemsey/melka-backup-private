/**
 * رجیستری انواع سامانه ARM — P6547/گام دوم (شاهکار کشف endpoint)
 * ---------------------------------------------------------------------------
 * کشف زندهٔ ۱۴۰۵/۰۷/۱۲: فیلدهای مرجع ردیف فهرست درخواست‌ها (tradeType،
 * buildingType، propertyType، userPaymentMethod، userSeriousity) «شناسهٔ خام»
 * هستند نه {name}. فهرست‌های مرجع خود سامانه (الگوی N("x",{addToURL:["list"]})):
 *   · building-types/list       → [{_id, name: "مسکونی", level, tradeTypes[]}]
 *   · property-types/list       → [{_id, name: "آپارتمان", buildingType: {...}}]
 *   · trade-types/list          → [{_id, name: "خرید/فروش…"}]
 *   · user-payment-methods/list → [{_id, name: "نقدی/ملک و نقد…"}]
 *   · user-seriousness/list     → [{_id, name: "خیلی زیاد/زیاد/متوسط/کم"}]
 *
 * این ماژول: (۱) همگام‌سازی فهرست‌های مرجع در RefListCache (کلید arm-type-registries)
 * (۲) بارگذاری نقشه‌های شناسه→نام برای نگاشت ردیف‌های فهرست درخواست/آگهی.
 * اصول: فقط GET · کش RefListCache (بدون تاریخ انقضا — فهرست‌های مرجع کم‌تغییرند) ·
 * شکست نرم (نقشهٔ خالی = ستون همان شناسه نمی‌شود؛ ردیف رد نمی‌شود).
 */

import { armCall } from "./client";
import { getMelkApiConfig } from "./config";
import { db } from "@/lib/db";

const CACHE_KEY = "arm-type-registries";

/** نقشه‌های شناسه→نام — کلیدهای معتبر */
export type TypeKind = "tradeType" | "buildingType" | "propertyType" | "paymentMethod" | "seriousness";

export interface TypeMaps {
  tradeType: Map<string, string>;
  buildingType: Map<string, string>;
  propertyType: Map<string, string>;
  paymentMethod: Map<string, string>;
  seriousness: Map<string, string>;
}

export function emptyTypeMaps(): TypeMaps {
  return {
    tradeType: new Map(),
    buildingType: new Map(),
    propertyType: new Map(),
    paymentMethod: new Map(),
    seriousness: new Map(),
  };
}

/** مسیرهای فهرست‌های مرجع — کشف زنده از باندل سامانهٔ ARM */
const REGISTRY_PATHS: Record<TypeKind, string> = {
  tradeType: "trade-types/list",
  buildingType: "building-types/list",
  propertyType: "property-types/list",
  paymentMethod: "user-payment-methods/list",
  seriousness: "user-seriousness/list",
};

/** همگام‌سازی همهٔ فهرست‌های مرجع در RefListCache — شکست هر فهرست مستقل */
export async function syncTypeRegistries(armToken: string): Promise<{ ok: boolean; synced: TypeKind[]; failed: Array<{ kind: TypeKind; error: string }> }> {
  const cfg = getMelkApiConfig();
  const out = { ok: true, synced: [] as TypeKind[], failed: [] as Array<{ kind: TypeKind; error: string }> };
  const stored: Partial<Record<TypeKind, Array<{ _id?: string; id?: string; name?: string }>>> = await readStored();
  for (const kind of Object.keys(REGISTRY_PATHS) as TypeKind[]) {
    try {
      const res = await armCall<unknown>({ path: REGISTRY_PATHS[kind], baseUrl: cfg.armApiBase, token: armToken, timeoutMs: 60_000, maxRetries: 1 });
      const d = (res.data ?? {}) as Record<string, unknown>;
      const list = Array.isArray(d["list"]) ? (d["list"] as Array<Record<string, unknown>>) : Array.isArray(res.data) ? (res.data as Array<Record<string, unknown>>) : [];
      if (list.length > 0) {
        stored[kind] = list.map((x) => ({ _id: String(x["_id"] ?? x["id"] ?? ""), name: typeof x["name"] === "string" ? x["name"] : undefined }));
        out.synced.push(kind);
      }
    } catch (e) {
      out.failed.push({ kind, error: (e as Error).message?.slice(0, 80) ?? "unknown" });
    }
  }
  if (out.synced.length > 0) {
    await db.refListCache.upsert({
      where: { key: CACHE_KEY },
      create: { key: CACHE_KEY, dataJson: JSON.stringify(stored) },
      update: { dataJson: JSON.stringify(stored) },
    }).catch(() => undefined);
  }
  out.ok = out.synced.length > 0;
  return out;
}

async function readStored(): Promise<Partial<Record<TypeKind, Array<{ _id?: string; id?: string; name?: string }>>>> {
  try {
    const row = await db.refListCache.findUnique({ where: { key: CACHE_KEY } });
    if (!row) return {};
    return JSON.parse(row.dataJson) as Partial<Record<TypeKind, Array<{ _id?: string; name?: string }>>>;
  } catch {
    return {};
  }
}

/** بارگذاری نقشه‌ها از کش — شکست = نقشه‌های خالی (صادقانه؛ ستون خالی می‌ماند) */
export async function loadTypeMaps(): Promise<TypeMaps> {
  const maps = emptyTypeMaps();
  const stored = await readStored();
  for (const kind of Object.keys(REGISTRY_PATHS) as TypeKind[]) {
    const list = stored[kind];
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const id = item?._id ?? item?.id;
      if (id && item?.name) maps[kind].set(id, item.name);
    }
  }
  return maps;
}
