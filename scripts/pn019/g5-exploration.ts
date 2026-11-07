/**
 * G5-exploration.ts — اکتشاف زندهٔ رانش مفهوم PN-019 (پیش از اسکریپت رسمی)
 * معیار: نرخ معامله (معامله شده / آگهی‌های به وضعیت پایانی رسیده) در سه بازهٔ ۳۰روزه
 * داده: PropertyRecord واقعی ARM (status + statusDate + createdAt)
 */
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

interface PropRow {
  propertyCode: string | null;
  status: string | null;
  statusDate: number | Date | null;
  createdAt: number | Date | null;
}

const TERMINAL = ["معامله شده", "منقضی شده", "فایل غیر قابل احیا", "رد شده توسط مدیر", " فایل قابل احیا"];

(async () => {
  const rows = (await p.$queryRawUnsafe(
    `SELECT propertyCode, status, statusDate, createdAt FROM PropertyRecord WHERE status IS NOT NULL AND statusDate IS NOT NULL`
  )) as PropRow[];
  const toMs = (v: number | Date | null | undefined): number | null => (v != null ? Number(v) : null);
  const inWinMs = (r: PropRow, from: number, to: number): boolean => { const t = toMs(r.statusDate); return t != null && t >= from && t < to; };
  const now = Date.now();
  const D = 86400000;

  console.log("کل ردیف‌های دارای وضعیت+تاریخ:", rows.length);

  // ── ۱) سه بازهٔ ۳۰روزهٔ اخیر ──
  const wins = [
    { label: "W1", from: now - 90 * D, to: now - 60 * D },
    { label: "W2", from: now - 60 * D, to: now - 30 * D },
    { label: "W3", from: now - 30 * D, to: now },
  ];
  for (const w of wins) {
    const inWin = rows.filter((r) => inWinMs(r, w.from, w.to));
    const resolved = inWin.filter((r) => r.status != null && TERMINAL.includes(r.status));
    const trans = resolved.filter((r) => r.status === "معامله شده");
    console.log(
      `${w.label} [${new Date(w.from).toISOString().slice(0, 10)} → ${new Date(w.to).toISOString().slice(0, 10)}]`,
      `تغییروضعیت=${inWin.length} پایانی=${resolved.length} معامله=${trans.length}`,
      `نرخ=${resolved.length ? (trans.length / resolved.length).toFixed(4) : "n/a"}`
    );
  }

  // ── ۲) کوهورت سن آگهی: از createdAt (ثبت ARM) تا statusDate (تعیین تکلیف) ──
  const withAge = rows.filter(
    (r) => r.status != null && TERMINAL.includes(r.status) && toMs(r.createdAt) != null && toMs(r.statusDate) != null && (toMs(r.statusDate) as number) > (toMs(r.createdAt) as number)
  );
  const ages = withAge.map((r) => ((toMs(r.statusDate) as number) - (toMs(r.createdAt) as number)) / D).sort((a, b) => a - b);
  const q = (x: number) => Math.round(ages[Math.floor(ages.length * x)] ?? 0);
  console.log(`\nکوهورت سن (n=${ages.length}): میانه=${q(0.5)}روز p10=${q(0.1)} p90=${q(0.9)}`);

  // نرخ معامله بر اساس سن آگهی در لحظهٔ تعیین تکلیف
  const buckets = [
    { label: "زیر ۳۰ روز", max: 30 },
    { label: "۳۰-۹۰ روز", max: 90 },
    { label: "۹۰-۱۸۰ روز", max: 180 },
    { label: "۱۸۰-۳۶۵ روز", max: 365 },
    { label: "بالای ۳۶۵ روز", max: Infinity },
  ];
  let lo = 0;
  for (const b of buckets) {
    const seg = withAge.filter((r) => {
      const a = ((toMs(r.statusDate) as number) - (toMs(r.createdAt) as number)) / D;
      return a >= lo && a < b.max;
    });
    const t = seg.filter((r) => r.status === "معامله شده").length;
    console.log(`سن ${b.label}: n=${seg.length} معامله=${t} نرخ=${seg.length ? (t / seg.length).toFixed(3) : "n/a"}`);
    lo = b.max;
  }

  // ── ۳) آیا «معاملات اخیر» یعنی جوان‌تر؟ توزیع سن آگهی‌های معامله‌شده در دو بازه ──
  for (const w of [wins[0]!, wins[2]!]) {
    const inWin = rows.filter((r) => inWinMs(r, w.from, w.to) && r.status != null && TERMINAL.includes(r.status));
    const trans = inWin.filter((r) => r.status === "معامله شده");
    const agesT = trans.map((r) => ((toMs(r.statusDate) as number) - (toMs(r.createdAt) as number)) / D).filter((x) => x >= 0).sort((a, b) => a - b);
    if (agesT.length) {
      console.log(
        `\n${w.label} معامله‌ها: n=${trans.length} میانهٔ سن=${Math.round(agesT[Math.floor(agesT.length / 2)])}روز`,
        `سهم زیر۳۰روز=${Math.round((agesT.filter((a) => a < 30).length / agesT.length) * 100)}%`
      );
    }
  }

  // ── ۴) نرخ معامله بر اساس کوهورت ثبت (createdAt) — شش‌ماهه‌های اخیر ──
  const coh: Array<{ cohort: string; resolved: number; transacted: number; rate: number | null }> = [];
  for (let i = 5; i >= 0; i--) {
    const from = now - (i + 1) * 180 * D;
    const to = now - i * 180 * D;
    const seg = rows.filter(
      (r) => { const t = toMs(r.createdAt); return t != null && t >= from && t < to && r.status != null && TERMINAL.includes(r.status); }
    );
    const t = seg.filter((r) => r.status === "معامله شده").length;
    coh.push({
      cohort: new Date(from).toISOString().slice(0, 7),
      resolved: seg.length,
      transacted: t,
      rate: seg.length ? +(t / seg.length).toFixed(3) : null,
    });
  }
  console.log("\nکوهورت ثبت (۶ ماهه):", JSON.stringify(coh));

  await p.$disconnect();
})();
