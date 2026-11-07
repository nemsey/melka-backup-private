/**
 * P1-02 — اسکریپت راستی‌آزمایی «قبل/بعد» توابع منتقل‌شده به analyzers
 * ------------------------------------------------------
 * پیاده‌سازی‌های «قبل» عیناً از کد baseline (کامیت 2b1bc21) کپی شده‌اند؛
 * خروجی آن‌ها باید با توابع جدید analyzers روی fixture ثابت یکسان باشد.
 */

import { monthlyCounts, demandLevel, marketTilt, cooperationDegree, areaTrendMatrix, parseFaAmount } from "../src/core/agent/analyzers";
import { dateToJalali } from "../src/lib/jalali";
import { faMonthLabel } from "../src/lib/format";

let failures = 0;
function assertEqual(name: string, before: unknown, after: unknown) {
  const b = JSON.stringify(before);
  const a = JSON.stringify(after);
  if (b !== a) {
    failures += 1;
    console.error(`✗ ${name}\n  قبل: ${b}\n  بعد: ${a}`);
  } else {
    console.log(`✓ ${name}`);
  }
}

// ===================== قبل: سری ماهانه TransactionsPage (baseline) =====================
function beforeMonthlyTx(rows: { contractDate: string }[]) {
  const map = new Map<string, number>();
  for (const t of rows) {
    const j = dateToJalali(new Date(t.contractDate));
    const key = `${j.jy}-${String(j.jm).padStart(2, "0")}`;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => ({ month: faMonthLabel(k), count: v }));
}

const TX_FIXTURE = [
  { contractDate: "2026-06-21T10:00:00.000Z" }, // ۱۴۰۵-۰۳
  { contractDate: "2026-06-25T10:00:00.000Z" },
  { contractDate: "2026-07-13T10:00:00.000Z" }, // ۱۴۰۵-۰۴
  { contractDate: "2026-08-01T10:00:00.000Z" },
  { contractDate: "2026-08-02T10:00:00.000Z" },
  { contractDate: "2026-08-03T10:00:00.000Z" },
  { contractDate: "2025-03-11T10:00:00.000Z" }, // ۱۴۰۳-۱۲ (مرتب‌سازی غیرخطی)
];

assertEqual(
  "سری ماهانه معاملات (Before/After)",
  beforeMonthlyTx(TX_FIXTURE),
  monthlyCounts(TX_FIXTURE.map((t) => t.contractDate)).map((p) => ({ month: faMonthLabel(p.key), count: p.count }))
);

// ===================== قبل: سری ماهانه VisitsPage (baseline) =====================
function beforeMonthlyKeys(rows: { createdAt: string }[]) {
  const map = new Map<string, number>();
  for (const r of rows) {
    const iso = new Date(r.createdAt);
    if (Number.isNaN(iso.getTime())) continue;
    const j = dateToJalali(iso);
    const key = `${j.jy}-${String(j.jm).padStart(2, "0")}`;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-9).map(([key, count]) => ({ key, label: faMonthLabel(key), count }));
}

const VI_FIXTURE = Array.from({ length: 14 }, (_, i) => ({
  createdAt: new Date(Date.UTC(2025, i, 15, 8, 0, 0)).toISOString(),
}));
VI_FIXTURE.push({ createdAt: "not-a-date" }); // نامعتبر — باید نادیده گرفته شود (سبک بازدیدها)
VI_FIXTURE.push({ createdAt: "2025-01-20T08:00:00.000Z" });

assertEqual(
  "سری ماهانه بازدیدها + skipInvalid + ۹ ماه آخر (Before/After)",
  beforeMonthlyKeys(VI_FIXTURE),
  monthlyCounts(VI_FIXTURE.map((r) => r.createdAt), { skipInvalid: true, takeLast: 9 }).map((p) => ({
    key: p.key,
    label: faMonthLabel(p.key),
    count: p.count,
  }))
);

// ===================== قبل: آستانه‌های SupplyDemandPage (baseline) =====================
function beforeDemandBadge(percent: number) {
  if (percent >= 60) return { label: "تقاضای بالا" };
  if (percent >= 40) return { label: "متعادل" };
  if (percent > 0) return { label: "تقاضای پایین" };
  return { label: "بدون درخواست" };
}
function demandLevelFa(l: "HIGH" | "BALANCED" | "LOW" | "NONE") {
  return { HIGH: "تقاضای بالا", BALANCED: "متعادل", LOW: "تقاضای پایین", NONE: "بدون درخواست" }[l];
}
for (const p of [0, 1, 25, 39.9, 40, 55, 59.9, 60, 75, 100]) {
  assertEqual(`آستانه تقاضا ${p} (Before/After)`, beforeDemandBadge(p).label, demandLevelFa(demandLevel(p)));
}

function beforeTilt(avg: number) {
  if (avg >= 60) return "بازار تقاضامحور است";
  if (avg >= 40) return "بازار نسبتاً متعادل است";
  return "بازار عرضه‌محور است";
}
function tiltFa(t: "DEMAND_LED" | "BALANCED" | "SUPPLY_LED") {
  return { DEMAND_LED: "بازار تقاضامحور است", BALANCED: "بازار نسبتاً متعادل است", SUPPLY_LED: "بازار عرضه‌محور است" }[t];
}
for (const avg of [0, 10, 39.9, 40, 50, 59.9, 60, 80]) {
  assertEqual(`جهت بازار ${avg} (Before/After)`, beforeTilt(avg), tiltFa(marketTilt(avg)));
}

// ===================== قبل: درجه همکاری ExpertsPage (baseline) =====================
function beforeCooperation(total: number) {
  if (total >= 20) return "محور همکاری";
  if (total >= 5) return "همکار پرتکرار";
  if (total > 0) return "کم‌تعامل";
  return "بدون تعامل";
}
function cooperationFa(d: "CORE" | "FREQUENT" | "RARE" | "NONE") {
  return { CORE: "محور همکاری", FREQUENT: "همکار پرتکرار", RARE: "کم‌تعامل", NONE: "بدون تعامل" }[d];
}
for (const t of [0, 1, 4, 5, 19, 20, 100]) {
  assertEqual(`درجه همکاری ${t} (Before/After)`, beforeCooperation(t), cooperationFa(cooperationDegree(t)));
}

// ===================== قبل: روند منطقه‌ای PriceIndexPage (baseline) =====================
function beforeTrendChart(trend: { areaName: string; recordedAt: string; medianPerMeter: number }[]) {
  const byArea = new Map<string, typeof trend>();
  for (const p of trend) {
    const arr = byArea.get(p.areaName) ?? [];
    arr.push(p);
    byArea.set(p.areaName, arr);
  }
  const topAreas = [...byArea.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 5);
  if (topAreas.length === 0) return [];
  const allDates = [...new Set(trend.map((p) => p.recordedAt.slice(0, 10)))].sort();
  return allDates.map((date) => {
    const row: Record<string, string | number> = { date };
    for (const [area] of topAreas) {
      const point = byArea.get(area)?.find((p) => p.recordedAt.slice(0, 10) === date);
      row[area] = point ? point.medianPerMeter : 0;
    }
    return row;
  });
}

const TREND_FIXTURE = [
  { areaName: "آب‌رسان", recordedAt: "2026-09-01T00:00:00.000Z", medianPerMeter: 5_000_000 },
  { areaName: "آب‌رسان", recordedAt: "2026-09-02T00:00:00.000Z", medianPerMeter: 5_100_000 },
  { areaName: "آب‌رسان", recordedAt: "2026-09-03T00:00:00.000Z", medianPerMeter: 4_900_000 },
  { areaName: "ولیعصر", recordedAt: "2026-09-01T00:00:00.000Z", medianPerMeter: 7_000_000 },
  { areaName: "ولیعصر", recordedAt: "2026-09-02T00:00:00.000Z", medianPerMeter: 7_200_000 },
  { areaName: "باغمیشه", recordedAt: "2026-09-03T00:00:00.000Z", medianPerMeter: 6_000_000 },
  { areaName: "زعفرانیه", recordedAt: "2026-09-01T00:00:00.000Z", medianPerMeter: 4_000_000 },
  { areaName: "海尔", recordedAt: "2026-09-02T00:00:00.000Z", medianPerMeter: 3_000_000 },
  { areaName: "منطقه‌شش", recordedAt: "2026-09-03T00:00:00.000Z", medianPerMeter: 3_500_000 },
  { areaName: "خاکستر", recordedAt: "2026-09-01T00:00:00.000Z", medianPerMeter: 2_500_000 },
  { areaName: "یادگار", recordedAt: "2026-09-02T00:00:00.000Z", medianPerMeter: 2_000_000 },
];

assertEqual("ماتریس روند منطقه‌ای (Before/After)", beforeTrendChart(TREND_FIXTURE), areaTrendMatrix(TREND_FIXTURE));
assertEqual("ماتریس روند خالی", beforeTrendChart([]), areaTrendMatrix([]));

// ===================== قبل: parseAmount FinancePage (baseline) =====================
function beforeParseAmount(v: string) {
  const normalized = v.replace(/[٬,،\s]/g, "").replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
  if (normalized === "") return undefined;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : undefined;
}
for (const s of ["", " ", "۱۲۳", "1,234", "۱٬۲۰۰٬۰۰۰", "۲۰۰۰۰۰۰۰۰۰", "abc", "12٬3", "۰", "4.5", "٬"]) {
  assertEqual(`parseAmount(${JSON.stringify(s)}) (Before/After)`, beforeParseAmount(s) ?? null, parseFaAmount(s) ?? null);
}

console.log(failures === 0 ? "\nهمه مقایسه‌های قبل/بعد یکسان ✓" : `\n${failures} ناهمخوانی!`);
process.exit(failures === 0 ? 0 : 1);
