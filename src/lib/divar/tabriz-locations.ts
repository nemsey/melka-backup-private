/**
 * منطقه‌بندی تبریز — عین ساختار سامانه ARM ملک تبریز
 * ------------------------------------------------------
 * منبع: API عمومی سامانه آرم (areas/list) — ۱۳۰ منطقه و ۹۲۶ محله
 * هر محله با شناسه یکتای آرم + مختصات جغرافیایی (نقطه مرکز).
 * این فایل داده ایستا است تا فیلتر مکان همیشه بدون وابستگی شبکه کار کند؛
 * بازتاب زنده در صورت دسترسی به آرم در scan انجام می‌شود.
 */

export interface TabrizLine {
  /** نام محله — عین سامانه آرم */
  n: string;
  /** شناسه یکتای محله در سامانه آرم (برای ثبت آگهی) */
  id: string;
  /** عرض جغرافیایی مرکز محله */
  lat: number | null;
  /** طول جغرافیایی مرکز محله */
  lng: number | null;
}

export interface TabrizArea {
  /** شناسه منطقه در سامانه آرم */
  id: string;
  /** نام منطقه */
  n: string;
  /** محله‌های این منطقه */
  l: TabrizLine[];
}

import raw from "./tabriz-locations.data.json";

interface RawShape {
  cityId: string;
  areas: TabrizArea[];
}

const data = raw as RawShape;

/** شناسه شهر تبریز در سامانه آرم */
export const TABRIZ_CITY_ID = data.cityId;

/** همه مناطق تبریز طبق آرم */
export const TABRIZ_AREAS: TabrizArea[] = data.areas;

/** همه محله‌ها به‌صورت مسطح */
export const ALL_LINES: (TabrizLine & { areaId: string; areaName: string })[] = data.areas.flatMap((a) =>
  a.l.map((l) => ({ ...l, areaId: a.id, areaName: a.n }))
);

/** فهرست مسطح برای UI (منطقه → محله) */
export function linesOfArea(areaId: string): TabrizLine[] {
  return data.areas.find((a) => a.id === areaId)?.l ?? [];
}

/** جست‌وجوی محله با شناسه */
export function findLine(lineId: string): (TabrizLine & { areaId: string; areaName: string }) | null {
  return ALL_LINES.find((l) => l.id === lineId) ?? null;
}

/** نام‌های نرمال‌شده برای تطبیق متنی */
function normalizeText(s: string): string {
  return s
    .replace(/[\u200c\u200f\u200e]/g, "")
    .replace(/[ي]/g, "ی")
    .replace(/[ك]/g, "ک")
    .replace(/[\s«»"'()\[\]،؛:.\-_]/g, "")
    .trim()
    .toLowerCase();
}

/** آیا حرف فارسی است؟ (برای بررسی مرز واژگی) */
function isPersianLetter(ch: string | undefined): boolean {
  if (!ch) return false;
  return /[\u0621-\u064A\u066E-\u06D3]/.test(ch);
}

/**
 * جست‌وجوی نام محله در متن با «مرز واژگی» پسین:
 * اگر نویسهٔ بعد از تطبیق حرف فارسی باشد، تطبیق کاذب است
 * (نمونه واقعی: محله «بینش» زیررشتهٔ «بی‌نشانه» می‌شود — رد می‌شود)
 */
function containsWithBoundary(hayNoSpace: string, key: string): boolean {
  const keyLen = key.length;
  let idx = hayNoSpace.indexOf(key);
  while (idx !== -1) {
    const after = hayNoSpace[idx + keyLen];
    if (!isPersianLetter(after)) return true; // مرز پسین معتبر (پایان واژه یا نویسه جداکننده)
    idx = hayNoSpace.indexOf(key, idx + 1);
  }
  return false;
}

const LINE_LOOKUP = new Map<string, (TabrizLine & { areaId: string; areaName: string })[]>();
for (const l of ALL_LINES) {
  const key = normalizeText(l.n);
  const arr = LINE_LOOKUP.get(key) ?? [];
  arr.push(l);
  LINE_LOOKUP.set(key, arr);
}

/** فاصله هاورساین بین دو نقطه (کیلومتر) */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export interface LocationMatchResult {
  /** امتیاز ۰ تا ۱۰۰ */
  score: number;
  areaId: string | null;
  areaName: string | null;
  lineId: string | null;
  lineName: string | null;
  /** شیوه تطبیق: text | coords | both | none */
  method: "text" | "coords" | "both" | "none";
  /** توضیح انسانی دلیل امتیاز */
  reason: string;
}

/**
 * تطبیق مکان آگهی دیوار با منطقه/محله‌های آرم.
 * دو سیگنال مستقل ترکیب می‌شوند:
 *  ۱) متنی — نام محله/منطقه در عنوان/مکان/توضیحات آگهی دیوار
 *  ۲) مختصات — فاصله نقطه آگهی تا مرکز محله (شعاع ~۱٫۲ کیلومتر = محله واقعی)
 */
export function matchTabrizLocation(input: {
  title: string;
  locationText?: string | null;
  description?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}): LocationMatchResult {
  const hay = normalizeText(
    `${input.title} ${input.locationText ?? ""} ${input.description ?? ""}`.slice(0, 1200)
  );
  let textMatch: (TabrizLine & { areaId: string; areaName: string }) | null = null;
  let textExact = false;

  // ۱) تطبیق متنی — ابتدا محله‌های با نام بلندتر (کمترین ابهام) و مرز واژگی پسین
  const candidates = [...ALL_LINES].sort((a, b) => b.n.length - a.n.length);
  for (const line of candidates) {
    const key = normalizeText(line.n);
    if (key.length < 3) continue; // نام‌های بسیار کوتاه ریسک تطبیق کاذب دارند
    if (containsWithBoundary(hay, key)) {
      textMatch = line;
      textExact = true;
      break;
    }
  }
  // اگر محله مستقیم پیدا نشد، نام منطقه را بیابیم و بهترین محله آن را نگه داریم
  if (!textMatch) {
    for (const area of data.areas) {
      const key = normalizeText(area.n);
      if (key.length < 4) continue;
      if (containsWithBoundary(hay, key)) {
        // نزدیک‌ترین محله از نظر متنی به عنوان نماینده منطقه
        textMatch = area.l[0] ? { ...area.l[0], areaId: area.id, areaName: area.n } : null;
        break;
      }
    }
  }

  // ۲) تطبیق مختصات
  let coordMatch: (TabrizLine & { areaId: string; areaName: string }) | null = null;
  let coordKm = Infinity;
  if (typeof input.latitude === "number" && typeof input.longitude === "number" && isFinite(input.latitude) && isFinite(input.longitude)) {
    let best: (TabrizLine & { areaId: string; areaName: string }) | null = null;
    let bestKm = Infinity;
    for (const line of ALL_LINES) {
      if (line.lat == null || line.lng == null) continue;
      const km = haversineKm(input.latitude, input.longitude, line.lat, line.lng);
      if (km < bestKm) {
        bestKm = km;
        best = line;
      }
    }
    if (best && bestKm <= 3) {
      coordMatch = best;
      coordKm = bestKm;
    }
  }

  // ترکیب دو سیگنال
  if (textMatch && coordMatch) {
    const sameLine = textMatch.id === coordMatch.id;
    const sameArea = textMatch.areaId === coordMatch.areaId;
    // اگر مختصات به خودِ محله متنی نزدیک است، همان را مرجع بگیر (سیگنال متنی قوی)
    const kmToTextLine =
      textMatch.lat != null && textMatch.lng != null && typeof input.latitude === "number" && typeof input.longitude === "number"
        ? haversineKm(input.latitude, input.longitude, textMatch.lat, textMatch.lng)
        : Infinity;
    if (kmToTextLine <= 1.5) {
      const score = kmToTextLine <= 0.2 ? 100 : kmToTextLine <= 0.8 ? 96 : 90;
      return {
        score,
        areaId: textMatch.areaId,
        areaName: textMatch.areaName,
        lineId: textMatch.id,
        lineName: textMatch.n,
        method: "both",
        reason: `تطبیق متنی و مختصاتی هر دو به «${textMatch.n}» (منطقه ${textMatch.areaName}) اشاره دارند — فاصله مختصات ${kmToTextLine.toFixed(1)} کیلومتر.`,
      };
    }
    const score = sameLine ? 100 : sameArea ? 92 : 78;
    return {
      score,
      areaId: coordMatch.areaId,
      areaName: coordMatch.areaName,
      lineId: coordMatch.id,
      lineName: coordMatch.n,
      method: "both",
      reason: sameLine
        ? `تطبیق متنی و مختصاتی هر دو به «${coordMatch.n}» (منطقه ${coordMatch.areaName}) اشاره دارند.`
        : `متن به «${textMatch.n}» و مختصات به «${coordMatch.n}» (فاصله ${coordKm.toFixed(1)} کیلومتر) اشاره دارد — هم‌منطقه در نظر گرفته شد.`,
    };
  }

  if (textMatch) {
    const score = textExact ? 88 : 68;
    return {
      score,
      areaId: textMatch.areaId,
      areaName: textMatch.areaName,
      lineId: textMatch.id,
      lineName: textMatch.n,
      method: "text",
      reason: textExact
        ? `نام محله «${textMatch.n}» (منطقه ${textMatch.areaName}) در متن آگهی یافت شد؛ مختصات آگهی در دسترس نیست.`
        : `نام منطقه «${textMatch.areaName}» در متن آگهی یافت شد؛ محله «${textMatch.n}» به‌عنوان نماینده انتخاب شد.`,
    };
  }

  if (coordMatch) {
    const score = coordKm <= 0.05 ? 100 : coordKm <= 0.8 ? 90 : coordKm <= 1.5 ? 72 : coordKm <= 3 ? 50 : 0;
    return {
      score,
      areaId: coordMatch.areaId,
      areaName: coordMatch.areaName,
      lineId: coordMatch.id,
      lineName: coordMatch.n,
      method: "coords",
      reason: `مختصات آگهی در ${coordKm.toFixed(2)} کیلومتری مرکز محله «${coordMatch.n}» (منطقه ${coordMatch.areaName}) است.`,
    };
  }

  return {
    score: 0,
    areaId: null,
    areaName: null,
    lineId: null,
    lineName: null,
    method: "none",
    reason: "هیچ نشانه مکانی قابل اتکایی در عنوان، متن یا مختصات آگهی یافت نشد.",
  };
}

/** بررسی تعلق یک محله به مجموعه انتخابی کاربر (منطقه یا محله) */
export function lineInSelection(
  line: { areaId: string; id: string },
  selection: { areaIds?: string[]; lineIds?: string[] }
): boolean {
  const areaOk = !selection.areaIds?.length || selection.areaIds.includes(line.areaId);
  const lineOk = !selection.lineIds?.length || selection.lineIds.includes(line.id);
  return areaOk && lineOk;
}
