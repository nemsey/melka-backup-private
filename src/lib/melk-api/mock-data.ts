/**
 * تولید داده واقع‌نمای سامانه ملک تبریز (حالت Mock)
 * ------------------------------------------------------
 * هدف: توسعه، تست و دمو بدون وابستگی به سامانه واقعی.
 * داده‌ها با RNG دانه‌دار (Seeded) تولید می‌شوند تا تست‌ها deterministic بمانند.
 * تناسب داده با بازار املاک تبریز (مبالغ، محله‌ها، کدهای پرسنلی) رعایت شده است.
 */

import type { CrmExpert, CrmTransaction, PropertyType } from "./types";

// ---------- RNG دانه‌دار (mulberry32) ----------
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DISTRICTS = [
  "ولیعصر",
  "زعفرانیه",
  "چایکنار",
  "عباس‌میرزا",
  "باغمیشه",
  "شاهگلی",
  "ائل‌گلی",
  "منصور",
  "آبرسان",
  "مرجان",
  "کوی دانشگاه",
  "قلی‌بیگ",
  "خسروآباد",
  "دامقولو",
  "تراب‌مسجد",
];

const EXPERT_NAMES: Array<[string, string]> = [
  ["علی", "اکبری"],
  ["فاطمه", "قلی‌زاده"],
  ["حسین", "یوسفی"],
  ["مریم", "صادقی"],
  ["محمد", "آقازاده"],
  ["زهرا", "حیدری"],
  ["رضا", "مهدوی"],
  ["سارا", "نعمتی"],
  ["امیر", "طاهری"],
  ["نسیم", "کاظمی"],
  ["مهدی", "رستمی"],
  ["الهام", "جعفری"],
  ["بابک", "فرزین"],
  ["لیلا", "امینی"],
  ["سعید", "موحدی"],
  ["شیوا", "رحیمی"],
  ["کیوان", "نجفی"],
  ["مینا", "اسدی"],
  ["فرهاد", "زارعی"],
  ["پریسا", "ملکی"],
  ["آرش", "صابری"],
  ["ندا", "خسروجردی"],
  ["بهنام", "شریفی"],
  ["سمیرا", "الله‌وردی"],
];

const STREETS = [
  "خیابان آزادی",
  "چهارراه عباسی",
  "خیابان ارتش جنوبی",
  "بلوار ۲۹ بهمن",
  "خیابان شهید بصیری",
  "بلوار کشاورز",
  "خیابان صمدیه",
  "بلوار ولیعصر",
  "خیابان آبرسان",
  "بلوار منصور",
];

const BRANCHES = ["شعبه مرکزی", "شعبه ولیعصر", "شعبه باغمیشه", "شعبه زعفرانیه", "شعبه ائل‌گلی"];

const PROPERTY_PROFILE: Array<{ type: PropertyType; weight: number; perMeter: [number, number]; area: [number, number] }> = [
  { type: "آپارتمان", weight: 0.45, perMeter: [25_000_000, 90_000_000], area: [55, 200] },
  { type: "کلنگی", weight: 0.2, perMeter: [40_000_000, 120_000_000], area: [80, 350] },
  { type: "مغازه", weight: 0.12, perMeter: [60_000_000, 200_000_000], area: [15, 80] },
  { type: "خانه ویلایی", weight: 0.13, perMeter: [35_000_000, 100_000_000], area: [120, 400] },
  { type: "دفتر اداری", weight: 0.07, perMeter: [30_000_000, 85_000_000], area: [40, 180] },
  { type: "باغ", weight: 0.03, perMeter: [8_000_000, 35_000_000], area: [500, 3000] },
];

function pick<T>(rand: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

function weightedProperty(rand: () => number): (typeof PROPERTY_PROFILE)[number] {
  const r = rand();
  let acc = 0;
  for (const p of PROPERTY_PROFILE) {
    acc += p.weight;
    if (r <= acc) return p;
  }
  return PROPERTY_PROFILE[0];
}

function roundPrice(p: number): number {
  // رُند کردن به مضرب ۵۰ میلیون تومان — واقع‌نمای فاکتورهای املاک
  const step = 50_000_000;
  return Math.max(step, Math.round(p / step) * step);
}

/** تاریخ‌های تصادفی در بازه‌ی N ماه گذشته تا امروز */
function randomPastDate(rand: () => number, monthsBack: number): Date {
  const now = Date.now();
  const spanMs = monthsBack * 30.5 * 24 * 3600 * 1000;
  const t = now - Math.floor(rand() * spanMs);
  return new Date(t);
}

/** کد پرسنلی کارشناس — مطابق الگوی سامانه (مثال مرجع: 410031320) */
function personnelCodeFor(i: number): string {
  return String(410031301 + i);
}

export function generateExperts(seed = 42, count = 24): CrmExpert[] {
  const rand = mulberry32(seed);
  return EXPERT_NAMES.slice(0, count).map((name, i) => {
    const [first, last] = name;
    const joined = randomPastDate(rand, 84); // حداکثر ۷ سال سابقه
    return {
      id: `EX-${String(i + 1).padStart(3, "0")}`,
      personnelCode: personnelCodeFor(i),
      fullName: `${first} ${last}`,
      mobile: `0914${String(1000000 + Math.floor(rand() * 8999999)).slice(0, 7)}`,
      address: `تبریز، ${pick(rand, STREETS)}، پلاک ${Math.floor(rand() * 120) + 1}`,
      branch: pick(rand, BRANCHES),
      active: rand() > 0.12, // ~۱۲٪ غیرفعال — واقع‌نما برای تحلیل ایجنت
      joinedAt: joined.toISOString(),
    };
  });
}

export function generateTransactions(
  experts: CrmExpert[],
  seed = 1337,
  count = 640,
  monthsBack = 18
): CrmTransaction[] {
  const rand = mulberry32(seed);
  const rows: CrmTransaction[] = [];
  for (let i = 0; i < count; i++) {
    const expert = pick(rand, experts);
    const profile = weightedProperty(rand);
    // تورم زمانی: معاملات قدیمی‌تر ارزان‌تر — برای روند معنادار در تحلیل
    const dealDate = randomPastDate(rand, monthsBack);
    const monthsAgo =
      (Date.now() - dealDate.getTime()) / (30.5 * 24 * 3600 * 1000);
    const inflationFactor = 1 / (1 + monthsAgo * 0.012);
    const base =
      (profile.perMeter[0] +
        rand() * (profile.perMeter[1] - profile.perMeter[0])) *
      (profile.area[0] + rand() * (profile.area[1] - profile.area[0]));
    const price = roundPrice(base * (0.7 + 0.3 * inflationFactor));
    // فصلی‌بودن بازار املاک: تابستان پربارتر — رُند نهایی پس از اعمال ضریب
    const month = dealDate.getMonth();
    const seasonal = month >= 5 && month <= 8 ? 1 : 0.85;

    rows.push({
      id: `TR-${String(i + 1).padStart(5, "0")}`,
      dealDate: dealDate.toISOString(),
      listingCode: `MT-${94000 + Math.floor(rand() * 5999)}`,
      requestCode: rand() < 0.62 ? `RF-${31000 + Math.floor(rand() * 8999)}` : null,
      expertCode: expert.personnelCode,
      expertName: expert.fullName,
      price: roundPrice(price * seasonal),
      district: pick(rand, DISTRICTS),
      propertyType: profile.type,
      area: Math.round(profile.area[0] + rand() * (profile.area[1] - profile.area[0])),
      commission: Math.round(roundPrice(price * seasonal) * 0.005), // نیم‌درصدِ قیمت نهایی
    });
  }
  return rows;
}
