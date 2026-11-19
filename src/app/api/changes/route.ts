/**
 * GET /api/changes — وضعیت کاشی «تغییرات» (DIR-CHANGES-TILE-001)
 * ---------------------------------------------------------------------------
 * نمای یکپارچه برای UI کاشی:
 *   · نشست تمام‌ظرفیت (گام سوم) — فعال/غیرفعال · شمارش معکوس انقضا · شروع‌کننده
 *   · وضعیت رلهٔ ترموکس — حالت · برخطی دستگاه · شمارنده‌های صف
 *   · متغیرهای گام اول (کاتالوگ شناسه‌ها/مسیرها/پیش‌فرض‌ها) — همان متغیرهای دو قابلیت
 */

import { NextRequest } from "next/server";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { MelkApiError } from "@/lib/melk-api/types";
import { db } from "@/lib/db";
import { changesSessionView } from "@/lib/changes/session";
import {
  ARM_PATHS,
  CAPABILITIES,
  CHANGES_SESSION_MAX_MS,
  HISTORY_ACTION_TYPES,
  LOCATION_IDS,
  OWNER_IDENTITY,
  PAYMENT_METHOD_IDS,
  SERIOUSNESS_IDS,
  STANDARD_DEFAULTS,
  TRADE_TYPE_IDS,
  BUILDING_TYPE_IDS,
  PROPERTY_TYPE_IDS,
} from "@/lib/changes/variables";
import { relayOverview, relayModeActive } from "@/lib/melk-api/relay";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  const session = changesSessionView();

  // وضعیت رله — بهترین‌تلاش (هیچ‌وقت وضعیت را نمی‌شکند)
  let relay: Record<string, unknown> = { mode: "off", active: false };
  try {
    const overview = await relayOverview();
    const online = overview.devices.some((d) => d.online && !d.revoked);
    relay = {
      mode: overview.mode,
      active: overview.active,
      relayModeActive: relayModeActive(),
      online,
      devices: overview.devices.map((d) => ({ label: d.label, online: d.online, served: d.servedCount, errors: d.errorCount, lastRoundtripMs: d.lastRoundtripMs })),
      queue: overview.queue,
    };
  } catch {
    /* وضعیت رله در دسترس نیست */
  }

  // شمارندهٔ آیتم‌های صف با اولویت کاشی (۱۰) — شاهد اختصاص ظرفیت
  let priorityQueue: { changes: number; interactive: number; bulk: number } | null = null;
  try {
    const [changes, interactive, bulk] = await Promise.all([
      db.relayQueue.count({ where: { status: "pending", priority: 10 } }),
      db.relayQueue.count({ where: { status: "pending", priority: 5 } }),
      db.relayQueue.count({ where: { status: "pending", priority: { lt: 5 } } }),
    ]);
    priorityQueue = { changes, interactive, bulk };
  } catch {
    /* شمارش بهترین-تلاش */
  }

  return Response.json({
    ok: true,
    session: {
      ...session,
      maxMs: CHANGES_SESSION_MAX_MS,
    },
    relay,
    priorityQueue,
    variables: {
      owner: OWNER_IDENTITY,
      location: LOCATION_IDS,
      tradeTypes: TRADE_TYPE_IDS,
      buildingTypes: BUILDING_TYPE_IDS,
      propertyTypes: PROPERTY_TYPE_IDS,
      paymentMethods: PAYMENT_METHOD_IDS,
      seriousness: SERIOUSNESS_IDS,
      standardDefaults: STANDARD_DEFAULTS,
      historyActionTypes: HISTORY_ACTION_TYPES,
      endpoints: {
        request: {
          update: "requests/update/{id}",
          history: "requests/history/{id}",
          info: "requests/info/{id}",
          eventUpdate: "request-events/update/{id}",
          eventDelete: "request-events/delete/{id}",
          eventsByProperty: "request-events/list?property={id}",
          list: ARM_PATHS.requestsList,
        },
        listing: {
          update: "properties/update/{id}",
          byCode: "properties/info/by-code/{code}",
          owner: "properties/owner/{id}",
          userUpdate: "users/update/{id}",
          list: ARM_PATHS.propertiesList,
        },
      },
    },
    capabilities: CAPABILITIES,
    role: guard.role,
  });
}
