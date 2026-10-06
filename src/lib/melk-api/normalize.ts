/**
 * توابع خالص نرمال‌سازی + کلید یکتا + merge — P6.5-04 (دستور شورا P6.5-04 بخش B.1 + طراحی §۳)
 * ==================================================================================
 * قرارداد عین دستور شورا (افزودنی مجاز، حذف ممنوع):
 *   normalizeName · normalizeAreaName · normalizePropertyCode · normalizeRequestCode
 *   normalizeMobile · normalizeAmount · normalizeJalaliDate · dedupKey · mergeRecords
 *
 * اصول حاکم (بخش C دستور):
 *   · صفر I/O — صفر Prisma، صفر fetch، صفر React، صفر LLM
 *   · همه توابع خالص و deterministic (ورودی یکسان → خروجی یکسان)
 *   · ورودی نامعتبر → خروجی صادقانه (رشته خالی / NaN مستند) — هرگز مقدار ساختگی
 *   · صفر حذف داده — merge فقط (mergeRecords)
 *
 * وابستگی‌ها: فقط @/lib/jalali (خالص تقویمی) + import type از bulk-import (تایپ‌صفرِ runtime).
 *
 * نکته الگوریتمی (لایه دوم تطبیق محله): الگوریتم termVector/کسینوسی عین base-agent
 * (نگاشت واژه→فراوانی + کسینوسی) به‌صورت «محلی» بازتولید شده — طبق قاعده مرز لایه‌ها
 * (الگوی P5-02 retrieval.ts: توابع خالص بین لایه‌ها منتقل نمی‌شوند)؛ افزوده: نگاره‌های
 * نویسه‌ای ۱/۲/۳-گرامی برای مقاوم‌سازی املای محاوره‌ای («ائل‌گلی» → «ایل گلی»).
 */

import { jalaliToGregorian, jalaliMonthLength } from "@/lib/jalali";
import type { BulkEntity } from "./bulk-import";

/**
 * P6.5-04-e-v2 → B.3 (P6.5-04-v2) — نسخه موتور نرمال‌سازی (لایه ۲ سه‌لایه حقیقت).
 * هر ردیف Bulk این نسخه را در ستون normalizationVersion حمل می‌کند؛
 * تغییر قواعد نرمال‌سازی ⇒ افزایش این ثابت (Rial/تومان، تاریخ‌ها، رجیستری محله).
 * B.3: نسل v2 — لایه ۱ خام نام/موبایل (raw*) حفظ و لایه ۲ از آن مشتق می‌شود
 * (عین الگوی rawPrice→price در e-v2؛ مقادیر نرمال خروجی برای ردیف‌های بدون خام تغییر نمی‌کند).
 */
export const NORMALIZATION_VERSION = "p65-04-v2";

// ==========================================================================
// ۱) پیش‌پردازش نویسه‌ها — ارقام و حروف عربی/فارسی (مشترک همه توابع)
// ==========================================================================

const FA_TO_EN_DIGITS: Record<string, string> = {
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
};

/** ارقام فارسی/عربی → لاتین (تعیین‌کننده — عین enDigits در jalali.ts) */
export function latinDigits(input: string): string {
  return input.replace(/[۰-۹٠-٩]/g, (d) => FA_TO_EN_DIGITS[d] ?? d);
}

/** یکسان‌سازی حروف: ي→ی، ك→ک، أ/إ/آ→ا، ة→ه + حذف اعراب/کشیده */
export function unifyPersianLetters(input: string): string {
  return input
    .replace(/[ي]/g, "ی")
    .replace(/[ك]/g, "ک")
    .replace(/[آأإ]/g, "ا")
    .replace(/[ة]/g, "ه")
    .replace(/[\u064B-\u0652\u0670\u0640]/g, ""); // اعراب + تنوین + کشیده ( Tateel )
}

/** نویسه‌های کنترلی و جهت‌متن */
const CTRL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u200E\u200F\u202A-\u202E]/g;

// ==========================================================================
// ۲) normalizeName — نام اشخاص/مالکان (عین B.1 دستور)
// ==========================================================================

/** نشان‌های نگارشی که از نام حذف می‌شوند (عین دستور: نقطه، ویرگول، پرانتز و…) */
const NAME_PUNCT_RE = /[.,()\[\]{}«»"'\u066A\u066B\u066C،؛:!?؟…\-_ـ*#+@^~`|/\\]/g;

/**
 * نرمال‌سازی نام (اشخاص، مالکان) — عین قواعد B.1-۱ دستور:
 *  · حذف ZWNJ (U+200C)
 *  · ی/ک عربی → فارسی · أ/إ/آ → ا · ة → ه
 *  · حذف فاصله اضافی (→ یک فاصله) · حذف نشان‌های نگارشی و اعراب
 * نمونه شاهد دستور: «محمّد  احمدی» → «محمد احمدی»
 */
export function normalizeName(raw: string): string {
  if (typeof raw !== "string" || raw.length === 0) return "";
  let s = raw.replace(CTRL_RE, "");
  s = latinDigits(s);
  s = unifyPersianLetters(s);
  s = s.replace(/\u200C/g, ""); // ZWNJ حذف (عین دستور)
  s = s.replace(NAME_PUNCT_RE, " ");
  // املا محاوره‌ای پسوند پایانی در نام‌ها (شاهد §۳.۲: رضائي → رضایی):
  // «ئی/ئي» پایانی = «یی» (ئ→ی)؛ ئ تنها-پایانی هم «ی» — ئ میانی (مسئول/مسئله) دست‌نخورده
  s = s.replace(/ئ(?=ی(?=\s|$))/g, "ی");
  s = s.replace(/ئ(?=\s|$)/g, "ی");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

// ==========================================================================
// ۳) normalizePropertyCode / normalizeRequestCode — کدهای ARM (عین B.1-۳)
// ==========================================================================

/** نرمال‌سازی مشترک کد آرم: trim · ارقام→لاتین · حذف فاصله/جداکننده · حرف اول ثابت · حذف صفر ابتدا */
function normalizeArmCode(raw: string): string {
  if (typeof raw !== "string") return "";
  let s = latinDigits(raw).replace(CTRL_RE, "");
  s = s.replace(/[\s\u200C\u066C,،_\-]/g, ""); // حذف فاصله و جداکننده‌های رایج کد
  if (s.length === 0) return "";
  // حرف اول (P یا R یا هر پیشوند لاتین) → بزرگ؛ بقیه فقط حرف/رقم نگه داشته می‌شود
  const first = s[0];
  const isLatinLetter = /[a-zA-Z]/.test(first);
  if (isLatinLetter) s = first.toUpperCase() + s.slice(1);
  // حذف صفرهای ابتدای بخش عددی (پس از پیشوند حرفی)
  const body = isLatinLetter ? s.slice(1) : s;
  const bodyNoLeadingZeros = body.replace(/^0+(?=\d)/, "");
  const cleanedBody = bodyNoLeadingZeros.replace(/[^0-9A-Za-z]/g, "");
  if (!isLatinLetter && cleanedBody.length === 0) return "";
  if (isLatinLetter && cleanedBody.length === 0) return ""; // فقط حرف بدون بدنه → نامعتبر
  return isLatinLetter ? first.toUpperCase() + cleanedBody : cleanedBody;
}

/** نرمال‌سازی کد ملک (ARM propertyCode) — نمونه دستور: « P۱۰۰۰۰۹ » → «P100009» */
export function normalizePropertyCode(raw: string): string {
  return normalizeArmCode(raw);
}

/** نرمال‌سازی کد درخواست (ARM requestCode) — همان قواعد، پیشوند رایج R */
export function normalizeRequestCode(raw: string): string {
  return normalizeArmCode(raw);
}

/** نرمال‌سازی ملایم شناسه‌های عددی (هولوگرام/کد پرسنلی): ارقام→لاتین + حذف فاصله — بدون حذف صفر ابتدا */
export function normalizeDigitsOnly(raw: string): string {
  if (typeof raw !== "string") return "";
  return latinDigits(raw).replace(CTRL_RE, "").replace(/[\s\u200C\u066C,،_\-]/g, "");
}

// ==========================================================================
// ۴) normalizeMobile — موبایل (عین B.1-۴ و جدول §۳.۶ طراحی)
// ==========================================================================

/**
 * نرمال‌سازی موبایل → قالب استاندارد ۰۹xxxxxxxxx
 *  · ارقام فارسی/عربی → لاتین · حذف نویسه‌های غیررقمی
 *  · حذف +۹۸/۰۰۹۸ → ۰ · افزودن ۰ به ۱۰رقمی‌های آغازشونده با ۹
 *  · اعتبارسنجی نهایی ^09\d{9}$ — نامعتبر → رشته خالی (شمارش در گزارش)
 */
export function normalizeMobile(raw: string): string {
  if (typeof raw !== "string") return "";
  let d = latinDigits(raw).replace(/[^0-9]/g, "");
  if (d.length === 0) return "";
  if (d.startsWith("0098")) d = "0" + d.slice(4);
  else if (d.startsWith("98") && d.length === 12) d = "0" + d.slice(2);
  if (d.length === 10 && d.startsWith("9")) d = "0" + d;
  return /^09\d{9}$/.test(d) ? d : "";
}

// ==========================================================================
// ۵) normalizeAmount — مبلغ → ریال پایه (عین B.1-۵ و §۳.۵ طراحی)
// ==========================================================================

/**
 * نرمال‌سازی مبلغ → عدد پایه به «ریال».
 *  · ارقام فارسی/عربی → لاتین · حذف جداکننده هزارگان (٬ ، , ' و فاصله)
 *  · مقیاس‌واژه‌ها: میلیون ×۱۰۰۰ · میلیارد ×۱۰⁶ · تریلیون ×۱۰⁹ (نسبت به مبنای تومان)
 *  · واحد: «ریال» ×۱ · «تومان» ×۱۰ · بدون واحد → پیش‌فرض تومان ×۱۰ (نمونه دستور: «۱٬۲۰۰٬۰۰۰» → ۱۲٬۰۰۰٬۰۰۰ ریال)
 *  · كسر با «/» یا «.» یا «٫» بین ارقام (۲/۵ میلیارد = ۲٫۵)
 *  · ورودی number → عیناً (مقدار پایه ساخت‌یافته — بدون تفسیر واحد متنی)
 *  · ورودی متنی غیرقابل‌تجزیه → NaN (پاسخ صادقانه؛ فراخواننده باید فیلد را کنار بگذارد)
 */
export function normalizeAmount(raw: string | number): number {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : NaN;
  if (typeof raw !== "string") return NaN;
  let s = latinDigits(raw).replace(CTRL_RE, "").trim();
  if (s.length === 0) return NaN;

  // واحد پول
  const hasToman = s.includes("تومان");
  const hasRial = !hasToman && s.includes("ریال");
  const unitFactor = hasRial ? 1 : 10; // پیش‌فرض (بدون واحد) = تومان، عین نمونه دستور

  // مقیاس‌واژه‌ها
  let scale = 1;
  if (s.includes("تریلیون")) scale = 1e12;
  else if (s.includes("میلیارد")) scale = 1e9;
  else if (s.includes("میلیون")) scale = 1e6;

  // استخراج بخش عددی: نگه‌داشتن ارقام + جداکننده اعشار / و .
  s = s.replace(/[\u066C\u060C,'\u00A0\s]/g, ""); // جداکننده هزارگان
  s = s.replace(/\u066B/g, "."); // ممیز عربی اعشار
  const decimalMatch = s.match(/(\d+)([/.])(\d+)/);
  if (decimalMatch) {
    s = decimalMatch[1] + "." + decimalMatch[3];
  } else {
    s = s.replace(/[/.]/g, ""); // نقطه/ممیل بدون جفت رقم = نویسه زائد
  }
  const numeric = s.match(/^-?\d+(\.\d+)?/);
  if (!numeric) return NaN;
  const value = parseFloat(numeric[0]);
  if (!Number.isFinite(value)) return NaN;
  return value * scale * unitFactor;
}

/**
 * P6.5-04-e-v2 — تجزیه عدد خام بدون مقیاس واحد (برای متراژ و اعداد ساده):
 * ارقام فارسی/عربی → لاتین · حذف جداکننده هزارگان · ممیز / و ٫ و . → اعشار.
 * برخلاف normalizeAmount هیچ واژه واحد/مقیاسی تفسیر نمی‌شود («۱۲۰ متر» → 120).
 * غیرقابل‌تجزیه → NaN (پاسخ صادقانه).
 */
export function parsePersianNumber(raw: string | number): number {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : NaN;
  if (typeof raw !== "string") return NaN;
  let s = latinDigits(raw).replace(CTRL_RE, "").trim();
  if (s.length === 0) return NaN;
  s = s.replace(/[\u066C\u060C,'\u00A0\s]/g, "");
  s = s.replace(/\u066B/g, ".");
  const decimalMatch = s.match(/(\d+)([/.])(\d+)/);
  if (decimalMatch) s = decimalMatch[1] + "." + decimalMatch[3];
  else s = s.replace(/[/.]/g, "");
  const m = s.match(/^-?\d+(\.\d+)?/);
  if (!m) return NaN;
  const v = parseFloat(m[0]);
  return Number.isFinite(v) ? v : NaN;
}

// ==========================================================================
// ۶) normalizeJalaliDate — تاریخ جلالی → ISO 8601 نیمه‌شب UTC (عین B.1-۶ و §۳.۴)
// ==========================================================================

/**
 * نرمال‌سازی تاریخ جلالی → «YYYY-MM-DDT00:00:00.000Z» (تاریخ تجاری بدون ساعت).
 *  · فرم‌ها: 1400/01/15 · 1400-1-5 · ۱۴۰۰/۰۱/۱۵ (تبدیل با jalaliToGregorian موجود)
 *  · سال ۱۳۰۰–۱۶۰۰ = جلالی؛ سال ≥ ۱۶۰۱ = میلادی (تحمل ورودی ISO)
 *  · تاریخ نامعتبر (مثل 1400/13/01) → رشته خالی «» — هرگز مقدار ساختگی (§۳.۴ طراحی)
 */
export function normalizeJalaliDate(raw: string): string {
  if (typeof raw !== "string") return "";
  let s = latinDigits(raw).replace(CTRL_RE, "").trim();
  if (s.length === 0) return "";

  // ورودی ISO با ساعت → فقط بخش تاریخ
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})T/);
  if (iso) s = `${iso[1]}/${iso[2]}/${iso[3]}`;

  s = s.replace(/[-.٫]/g, "/");
  const m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!m) return "";
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const d = parseInt(m[3], 10);

  if (y >= 1300 && y <= 1600) {
    // جلالی
    if (mo < 1 || mo > 12) return "";
    if (d < 1 || d > jalaliMonthLength(y, mo)) return "";
    const [gy, gm, gd] = jalaliToGregorian(y, mo, d);
    return new Date(Date.UTC(gy, gm - 1, gd)).toISOString();
  }
  if (y > 1600) {
    // میلادی (تحمل ورودی)
    if (mo < 1 || mo > 12) return "";
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return ""; // ۳۰ فوریه و…
    return dt.toISOString();
  }
  return ""; // سال خارج از بازه → قابل‌تبدیل نیست
}

// ==========================================================================
// ۷) بردارهای تطبیق — واژه‌ای و نویسه‌نگرام (الگوریتم termVector/کسینوسی base-agent، محلی)
// ==========================================================================

/** توکن‌سازی واژه‌ای — جداکننده‌ها: فاصله/ZWNJ/نقطه‌گذاری؛ واژه‌های تک‌نویسه فقط اگر رقم باشند */
export function tokenizeWords(text: string): string[] {
  return text
    .split(/[\s\u200C،؛:().!؟?()[\]{}«»"'،_\-…/\\|]+/)
    .filter((t) => t.length > 1 || (t.length === 1 && /[0-9]/.test(t)));
}

/** بردار فراوانی واژه (Term Frequency) — الگوریتم عین termVector در base-agent؛ رقم‌های تکی حفظ می‌شوند («ولیعصر 2») */
export function wordTermVector(text: string): Map<string, number> {
  const vec = new Map<string, number>();
  for (const tok of tokenizeWords(text)) vec.set(tok, (vec.get(tok) ?? 0) + 1);
  return vec;
}

/** بردار نویسه‌نگرام ۱+۲+۳-گرامی از رشته بدون فاصله — مقاوم‌سازی املای محاوره‌ای */
export function charGramVector(flat: string): Map<string, number> {
  const vec = new Map<string, number>();
  const bump = (k: string) => vec.set(k, (vec.get(k) ?? 0) + 1);
  for (let i = 0; i < flat.length; i++) bump(flat[i]);
  for (let i = 0; i + 1 < flat.length; i++) bump(flat.slice(i, i + 2));
  for (let i = 0; i + 2 < flat.length; i++) bump(flat.slice(i, i + 3));
  return vec;
}

/** شباهت کسینوسی دو بردار فراوانی — الگوریتم عین cosineSimilarity در base-agent */
export function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const v of a.values()) normA += v * v;
  for (const v of b.values()) normB += v * v;
  if (normA === 0 || normB === 0) return 0;
  for (const [k, v] of a) {
    const w = b.get(k);
    if (w) dot += v * w;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ==========================================================================
// ۸) رجیستری مکان — انواع و ساخت نمایه (P6.5-04-c)
// ==========================================================================

/** یک مدخل جستجو: منطقه (area) یا محله (line) — عین رجیستری ۱۳۰×۹۲۶ آرم */
export interface LocationEntry {
  /** شناسه یکتا (areaId برای منطقه، lineId برای محله) */
  id: string;
  /** نام رسمی سامانه آرم */
  name: string;
  kind: "area" | "line";
  /** منطقه والد (برای خود منطقه = شناسه خودش) */
  areaId: string;
  areaName: string;
}

/** نتیجه تطبیق موفق */
export interface LocationMatch {
  matchedId: string;
  matchedName: string;
  kind: "area" | "line";
  areaId: string;
  areaName: string;
  /** امتیاز ۰..۱ */
  score: number;
  /** شیوه: exact | exact+pref (ترجیح ناحیه) | vector | token */
  method: "exact" | "exact+pref" | "vector" | "token";
}

interface IndexedEntry extends LocationEntry {
  fullKey: string;
  coreKey: string;
  tokens: Set<string>;
}

/** رجیستری جستجو — نمایه‌ها یک‌بار ساخته می‌شوند (lazy + cache در location-registry.ts) */
export interface LocationRegistry {
  entries: readonly LocationEntry[];
  /** جستجو با کلید کامل یا هسته (بدون پرانتز) */
  findByKey(key: string): readonly LocationEntry[];
  /** توکن → شناسه مدخل‌های شامل آن (لایه توکن مشترک) */
  findIdsByToken(token: string): readonly string[];
  /** مدخل با شناسه */
  byId(id: string): LocationEntry | undefined;
}

/** حذف محتوای پرانتز — «دادگستری (ایل گلی)» → «دادگستری» */
function stripParens(s: string): string {
  return s.replace(/[(（][^()]*[)）]/g, " ").replace(/\s+/g, " ").trim();
}

/** واژه‌های عمومی مکان — در لایه برداری از دو طرف کنار گذاشته می‌شوند */
export const GENERIC_LOCATION_WORDS: ReadonlySet<string> = new Set([
  "خیابان", "کوچه", "بلوار", "بازار", "پارک", "پل", "فلکه", "میدان",
  "شهرک", "کوی", "محله", "منطقه", "جاده", "بن‌بست", "مجتمع",
]);

/** حذف واژه‌های عمومی از هسته — «شهرک ولیعصر» → «ولیعصر» (اگر خالی شد، عین ورودی) */
function stripGenericWords(s: string): string {
  const toks = tokenizeWords(s).filter((t) => !GENERIC_LOCATION_WORDS.has(t));
  return toks.length > 0 ? toks.join(" ") : s;
}

/** کلید تطبیق دقیق: ارقام→لاتین، حروف یکسان، حذف فاصله/ZWNJ/نقطه‌گذاری، کوچک */
export function locationKey(s: string): string {
  let out = latinDigits(unifyPersianLetters(s))
    .replace(CTRL_RE, "")
    .replace(/\u200C/g, "")
    .replace(/[\s«»"'()\[\]{}،؛:,.!?؟…\-_ـ*#+@^~`|/\\· ٬٬]+/g, "");
  return out.toLowerCase();
}

/** نرمال‌سازی سبک برای توکن‌سازی لایه سوم */
function lightNormalize(s: string): string {
  return latinDigits(unifyPersianLetters(s)).replace(CTRL_RE, "").replace(/[\u200C]+/g, " ").trim();
}

/** ساخت رجیستری نمایه‌دار از مدخل‌های خام — خالص و deterministic؛
 *  نمایه‌ها: کلید کامل + کلید هسته (بدون پرانتز) + توکن‌ها؛ بردارهای لایه دوم تنبل ساخته می‌شوند */
export function buildLocationRegistry(rawEntries: readonly LocationEntry[]): LocationRegistry {
  const indexed: IndexedEntry[] = rawEntries.map((e) => ({
    ...e,
    fullKey: locationKey(e.name),
    coreKey: locationKey(stripParens(e.name) || e.name),
    tokens: new Set(tokenizeWords(lightNormalize(e.name)).filter((t) => t.length >= 3)),
  }));

  const byKey = new Map<string, LocationEntry[]>();
  const byIdMap = new Map<string, LocationEntry>();
  const tokenIndex = new Map<string, Set<string>>();

  const pushKey = (key: string, e: LocationEntry) => {
    if (!key) return;
    const arr = byKey.get(key);
    if (arr) arr.push(e);
    else byKey.set(key, [e]);
  };
  for (const e of indexed) {
    pushKey(e.fullKey, e);
    if (e.coreKey !== e.fullKey) pushKey(e.coreKey, e);
    byIdMap.set(e.id, e);
    for (const t of e.tokens) {
      const set = tokenIndex.get(t);
      if (set) set.add(e.id);
      else tokenIndex.set(t, new Set([e.id]));
    }
  }

  return {
    entries: rawEntries,
    findByKey: (key: string): readonly LocationEntry[] => byKey.get(key) ?? [],
    findIdsByToken: (token: string): readonly string[] => [...(tokenIndex.get(token) ?? [])],
    byId: (id: string): LocationEntry | undefined => byIdMap.get(id),
  };
}

// بردارهای لایه دوم — ساخته‌شده تنبل (یک‌بار برای هر رجیستری، کش WeakMap)
interface EntryVector {
  words: Map<string, number>;
  grams: Map<string, number>;
  core: string;
  kind: "area" | "line";
}
const REGISTRY_VECS = new WeakMap<LocationRegistry, Map<string, EntryVector>>();

/** بردارهای مدخل‌های رجیستری — تنبل + کش‌شده؛ برای رجیستری‌های ساخته‌شده با buildLocationRegistry و رجیستری‌های تزریقی تست */
function registryVectors(registry: LocationRegistry): Map<string, EntryVector> {
  let m = REGISTRY_VECS.get(registry);
  if (m) return m;
  m = new Map<string, EntryVector>();
  for (const e of registry.entries) {
    const core = stripGenericWords(lightNormalize(stripParens(e.name) || e.name));
    m.set(e.id, { words: wordTermVector(core), grams: charGramVector(locationKey(core)), core, kind: e.kind });
  }
  REGISTRY_VECS.set(registry, m);
  return m;
}

// ==========================================================================
// ۹) findLocationInRegistry — تطبیق سه‌لایه (عین B.1-۲ دستور)
// ==========================================================================

/** آستانه لایه برداری — عین دستور: score ≥ ۰٫۷ */
export const AREA_MATCH_THRESHOLD = 0.7;

function toMatch(e: LocationEntry, score: number, method: LocationMatch["method"]): LocationMatch {
  return {
    matchedId: e.id,
    matchedName: e.name,
    kind: e.kind,
    areaId: e.areaId,
    areaName: e.areaName,
    score,
    method,
  };
}

function pickUniqueByKey(cands: readonly LocationEntry[]): LocationEntry | null {
  const areas = cands.filter((c) => c.kind === "area");
  if (areas.length === 1) return areas[0];
  const lines = cands.filter((c) => c.kind === "line");
  if (areas.length === 0 && lines.length === 1) return lines[0];
  return null; // چند ناحیه یا چند خط هم‌نام → مبهم → عدم تطبیق (fail-closed)
}

/**
 * تطبیق نام محله/منطقه در رجیستری — سه لایه عین دستور:
 *  ۱) تطبیق دقیق (کلید کامل، سپس کلید هسته بدون پرانتز) — برخورد هم‌نام: ترجیح ناحیه
 *  ۲) تطبیق برداری: max(کسینوس واژه‌ای، کسینوس نویسه‌نگرام) روی هسته بدون واژه عمومی — آستانه ۰٫۷
 *     تساوی هم‌نوع (ناحیه-ناحیه / خط-خط) → مبهم؛ تساوی ناحیه-خط → ترجیح ناحیه
 *  ۳) توکن متمایز مشترک (posting یکتا یا دوگانه که به یک مدخل می‌رسد)
 * بدون تطبیق → null (صفر تطبیق کاذب — نمونه‌های ناموجود راستی‌آزمایی شده)
 */
export function findLocationInRegistry(raw: string, registry: LocationRegistry): LocationMatch | null {
  if (typeof raw !== "string" || raw.trim().length === 0) return null;
  const fullKey = locationKey(raw);
  if (!fullKey) return null;

  // ---- لایه ۱: تطبیق دقیق ----
  const coreKey = locationKey(stripParens(raw) || raw);
  for (const key of fullKey === coreKey ? [fullKey] : [fullKey, coreKey]) {
    const cands = registry.findByKey(key);
    if (cands.length === 1) return toMatch(cands[0], 1, "exact");
    if (cands.length > 1) {
      const picked = pickUniqueByKey(cands);
      if (picked) return toMatch(picked, 1, "exact+pref");
    }
  }

  // ---- لایه ۲: تطبیق برداری ----
  const inputCore = stripGenericWords(lightNormalize(stripParens(raw) || raw));
  const wv = wordTermVector(inputCore);
  const gv = charGramVector(locationKey(inputCore));
  const vecs = registryVectors(registry);
  let bestEntry: LocationEntry | null = null;
  let bestScore = 0;
  let bestKind: "area" | "line" | null = null;
  let secondScore = -1;
  let secondKind: "area" | "line" | null = null;
  for (const e of registry.entries) {
    const v = vecs.get(e.id);
    if (!v) continue;
    const score = Math.max(cosineSimilarity(wv, v.words), cosineSimilarity(gv, v.grams));
    if (bestEntry === null) {
      bestEntry = e;
      bestScore = score;
      bestKind = v.kind;
      continue;
    }
    if (score > bestScore + 1e-9) {
      // برترین جدید — برترین قبلی به دومین تبدیل می‌شود
      secondScore = bestScore;
      secondKind = bestKind;
      bestEntry = e;
      bestScore = score;
      bestKind = v.kind;
    } else if (Math.abs(score - bestScore) <= 1e-9) {
      if (v.kind === "area" && bestKind === "line") {
        // تساوی ناحیه-خط → ناحیه جایگزین؛ خط به دومین تبدیل می‌شود
        secondScore = bestScore;
        secondKind = bestKind;
        bestEntry = e;
        bestKind = v.kind;
      } else {
        // هم‌امتیاز هم‌نوع (یا خط هم‌امتیاز با ناحیه برتر) → کاندید دوم
        secondScore = score;
        secondKind = v.kind;
      }
    } else if (score > secondScore) {
      secondScore = score;
      secondKind = v.kind;
    }
  }
  if (bestEntry && bestKind && bestScore >= AREA_MATCH_THRESHOLD) {
    // تساوی دقیق هم‌نوع (ناحیه-ناحیه / خط-خط) → مبهم (fail-closed)؛ ناحیه-خط هم‌امتیاز → ناحیه (بالا اعمال شد)
    if (secondKind !== null && secondKind === bestKind && Math.abs(secondScore - bestScore) <= 1e-9) {
      return null;
    }
    return toMatch(bestEntry, bestScore, "vector");
  }

  // ---- لایه ۳: توکن متمایز مشترک ----
  const inputTokens = tokenizeWords(lightNormalize(raw)).filter((t) => t.length >= 3);
  const candIds = new Set<string>();
  for (const t of inputTokens) {
    const posting = registry.findIdsByToken(t);
    if (posting.length >= 1 && posting.length <= 2) {
      for (const id of posting) candIds.add(id);
    }
  }
  if (candIds.size === 1) {
    const e = registry.byId([...candIds][0]);
    if (e) return toMatch(e, 0.5, "token");
  }
  return null;
}

// ==========================================================================
// ۱۰) normalizeAreaName — عین امضای B.1 دستور + افزوده‌های گزارش‌دهی
// ==========================================================================

/** خروجی normalizeAreaName — normalized همیشه نام رسمی رجیستری در صورت تطبیق (§۳.۳) */
export interface NormalizedAreaName {
  /** نام نرمال‌شده (در صورت تطبیق: نام رسمی رجیستری؛ وگرنه نام پاک‌شده ورودی) */
  normalized: string;
  matchedId?: string;
  matchedName?: string;
  // ---- افزوده‌های گزارش‌دهی (مجاز طبق دستور) ----
  method?: "exact" | "exact+pref" | "vector" | "token" | "none";
  score?: number;
  matchedKind?: "area" | "line";
  areaId?: string;
  areaName?: string;
  lineId?: string;
  lineName?: string;
}

/**
 * نرمال‌سازی نام محله/منطقه — طبق قواعد normalizeName، سپس تطبیق با رجیستری ۹۲۶ محله.
 * اگر تطبیق یافت نشد: matchedId = undefined (لاگ/شمارش در گزارش خط لوله).
 */
export function normalizeAreaName(raw: string, registry: LocationRegistry): NormalizedAreaName {
  const normalized = normalizeName(raw);
  const match = findLocationInRegistry(raw, registry);
  if (!match) {
    return { normalized, method: "none", score: 0 };
  }
  return {
    normalized: match.matchedName,
    matchedId: match.matchedId,
    matchedName: match.matchedName,
    method: match.method,
    score: match.score,
    matchedKind: match.kind,
    ...(match.kind === "area"
      ? { areaId: match.areaId, areaName: match.areaName }
      : { areaId: match.areaId, areaName: match.areaName, lineId: match.matchedId, lineName: match.matchedName }),
  };
}

// ==========================================================================
// ۱۱) dedupKey — کلید یکتای مفهومی هر موجودیت (عین B.1-۷ + §۲.۱/§۳.۷ طراحی)
// ==========================================================================

function str(v: unknown): string {
  return typeof v === "string" ? v : v === null || v === undefined ? "" : String(v);
}

function isoDateOrNull(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  const s = str(v);
  if (!s) return "";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

/**
 * کلید یکتای رکورد — عین قواعد B.1-۷ دستور:
 *  transaction: contractHolo اگر موجود، وگرنه propertyCode + contractDate
 *  expert: personnelCode · listing: propertyCode · request: requestCode
 *  visit: visitCode · contract: contractHolo
 *  interaction: requestCode + requestRealtorName + propertyRealtorName
 *
 * نقشه صادقانه (عین کشف §۱.۱۱ P6.5-03): «visitCode» در داده واقعی ARM وجود ندارد —
 * معادل پایدار آن شناسه ردیف (id) است؛ «requestCode» تعاملات هم در ساختار واقعی
 * realtor-interactions نیست — کلید واقعی جفت نام مشاوران است (requestCode در صورت
 * وجود در رکورد، پیشوند می‌شود). این کلید «مفهومی» فقط برای گزارش/شمارش/تست است؛
 * خود upsert روی کلید فیزیکی Prisma عمل می‌کند (§۳.۷ طراحی).
 */
export function dedupKey(entity: BulkEntity, record: Record<string, unknown>): string {
  switch (entity) {
    case "transaction": {
      const holo = normalizeDigitsOnly(str(record.contractHolo));
      if (holo) return `transaction:${holo}`;
      const code = normalizePropertyCode(str(record.propertyCode));
      const date = isoDateOrNull(record.contractDate);
      return `transaction:${code}:${date}`;
    }
    case "expert":
      return `expert:${normalizeDigitsOnly(str(record.personnelCode))}`;
    case "listing":
      return `listing:${normalizePropertyCode(str(record.propertyCode))}`;
    case "request":
      return `request:${normalizeRequestCode(str(record.requestCode))}`;
    case "visit":
      return `visit:${normalizeDigitsOnly(str(record.visitCode ?? record.id))}`;
    case "contract": {
      const holo = normalizeDigitsOnly(str(record.contractHolo));
      return holo ? `contract:${holo}` : `contract:${normalizeDigitsOnly(str(record.id))}`;
    }
    case "interaction": {
      const rc = normalizeRequestCode(str(record.requestCode));
      const a = normalizeName(str(record.requestRealtorName));
      const b = normalizeName(str(record.propertyRealtorName));
      return `interaction:${rc}:${a}:${b}`;
    }
  }
}

// ==========================================================================
// ۱۲) mergeRecords — merge با حفظ non-null (عین B.1 دستور + §۲.۴ طراحی)
// ==========================================================================

/**
 * merge رکورد جدید با رکورد موجود — فیلدهای غیر-null جدید جایگزین می‌شوند؛
 * فیلدهای null جدید، مقادیر قدیمی را پاک نمی‌کنند («جدیدترین داده غیرتهی برنده»).
 * هم‌ارز خالصِ mergeNonNullUpdate در لایه Repository (منبع مرجع تست‌ها و خط لوله اعتبارسنجی).
 */
export function mergeRecords<T extends Record<string, unknown>>(existing: T, incoming: Partial<T>): T {
  const out: Record<string, unknown> = { ...existing };
  for (const [k, v] of Object.entries(incoming)) {
    if (v !== null && v !== undefined) out[k] = v;
  }
  return out as T;
}

// ==========================================================================
// ۱۳) normalizeBulkRow — قلاب نرمال‌سازی خط لوله (P6.5-04-d)
// ==========================================================================

/** نوع هر قاعده فیلد */
type FieldKind =
  | "name"
  | "propertyCode"
  | "requestCode"
  | "mobile"
  | "holo"
  | "areaName"
  | "lineName"
  /** P6.5-04-e-v2 — لایه ۲ از لایه ۱ خام مشتق می‌شود (سه‌لایه حقیقت) */
  | "amount" // rawPrice (+rawPriceUnit) → price (ریال)
  | "area" // rawArea → meterage
  | "jalaliDate"; // rawDate → contractDate (فقط در نبود مقدار موجود)

interface FieldRule {
  field: string;
  kind: FieldKind;
  /**
   * B.3 (P6.5-04-v2) — فیلد مقصد لایه ۲ برای مشتق‌سازی از خام (سه‌لایه حقیقت):
   * مقدار نرمال در target نوشته می‌شود و خود فیلد خام عین منبع دست‌نخورده می‌ماند
   * (الگوی rawPrice→price). نبود target = نرمال‌سازی درجا (سازگاری ردیف‌های قدیمی بدون لایه خام).
   */
  target?: string;
}

/** قواعد فیلد هر موجودیت — «فیلدهای متناسب» عین B.1-d دستور
 *  + B.3: قواعد raw→target پیش از قواعد درجا (مشتق‌سازی لایه ۲ از لایه ۱ خام) */
const FIELD_RULES: Record<BulkEntity, readonly FieldRule[]> = {
  transaction: [
    { field: "propertyCode", kind: "propertyCode" },
    { field: "requestCode", kind: "requestCode" },
    { field: "rawPropertyCustomer", kind: "name", target: "propertyCustomer" },
    { field: "propertyCustomer", kind: "name" },
    { field: "rawRequestCustomer", kind: "name", target: "requestCustomer" },
    { field: "requestCustomer", kind: "name" },
    { field: "contractHolo", kind: "holo" },
    { field: "rawDate", kind: "jalaliDate" },
  ],
  expert: [
    { field: "personnelCode", kind: "holo" },
    { field: "rawFullName", kind: "name", target: "fullName" },
    { field: "fullName", kind: "name" },
    { field: "rawMobile", kind: "mobile", target: "mobile" },
    { field: "mobile", kind: "mobile" },
    { field: "rawBusinessTitle", kind: "name", target: "businessTitle" },
    { field: "businessTitle", kind: "name" },
    { field: "rawCreator", kind: "name", target: "creator" },
    { field: "creator", kind: "name" },
  ],
  listing: [
    { field: "propertyCode", kind: "propertyCode" },
    { field: "rawOwnerName", kind: "name", target: "ownerName" },
    { field: "ownerName", kind: "name" },
    { field: "rawOwnerMobile", kind: "mobile", target: "ownerMobile" },
    { field: "ownerMobile", kind: "mobile" },
    { field: "areaName", kind: "areaName" },
    { field: "lineName", kind: "lineName" },
    { field: "rawPrice", kind: "amount" },
    { field: "rawArea", kind: "area" },
  ],
  request: [
    { field: "requestCode", kind: "requestCode" },
    { field: "rawCustomerName", kind: "name", target: "customerName" },
    { field: "customerName", kind: "name" },
    { field: "rawCustomerMobile", kind: "mobile", target: "customerMobile" },
    { field: "customerMobile", kind: "mobile" },
  ],
  visit: [
    { field: "propertyCode", kind: "propertyCode" },
    { field: "rawRequesterName", kind: "name", target: "requesterName" },
    { field: "requesterName", kind: "name" },
    { field: "rawCheckerName", kind: "name", target: "checkerName" },
    { field: "checkerName", kind: "name" },
    { field: "rawPropertyRealtorName", kind: "name", target: "propertyRealtorName" },
    { field: "propertyRealtorName", kind: "name" },
  ],
  contract: [
    { field: "contractHolo", kind: "holo" },
    { field: "propertyCode", kind: "propertyCode" },
    { field: "requestCode", kind: "requestCode" },
    { field: "rawCreatorName", kind: "name", target: "creatorName" },
    { field: "creatorName", kind: "name" },
    { field: "rawPropertyTitle", kind: "name", target: "propertyTitle" },
    { field: "propertyTitle", kind: "name" },
    { field: "rawDate", kind: "jalaliDate" },
  ],
  interaction: [
    { field: "rawRequestRealtorName", kind: "name", target: "requestRealtorName" },
    { field: "requestRealtorName", kind: "name" },
    { field: "rawPropertyRealtorName", kind: "name", target: "propertyRealtorName" },
    { field: "propertyRealtorName", kind: "name" },
  ],
};

/** آمار نرمال‌سازی یک ردیف */
export interface RowNormStats {
  /** فیلدهایی که نرمال‌سازی مقدارشان را عوض کرد */
  changedFields: string[];
  /** فیلدهایی که ورودی معنادار داشت اما خروجی نامعتبر شد (رد صادقانه) */
  invalidFields: string[];
  /** تطبیق محله موفق (فقط listing) */
  areaMatched: boolean;
  /** نام محله/خط موجود ولی بدون تطبیق (فقط listing) */
  areaUnmatched: boolean;
  /** کلید یکتای مفهومی */
  key: string;
}

/**
 * نرمال‌سازی یک ردیف نگاشت‌شده خط لوله — خالص و idempotent
 * (نرمال‌سازی مجدد ردیف نرمال‌شده = همان ردیف؛ اثبات‌شده در تست deterministic).
 * فیلدهای متناسب هر موجودیت + تطبیق رجیستری محله برای listing (areaName→areaId، lineName→lineId).
 */
export function normalizeBulkRow<T extends Record<string, unknown>>(
  entity: BulkEntity,
  row: T,
  registry: LocationRegistry
): { row: T; stats: RowNormStats } {
  const out: Record<string, unknown> = { ...row };
  const changedFields: string[] = [];
  const invalidFields: string[] = [];
  let areaMatched = false;
  let areaUnmatched = false;

  for (const rule of FIELD_RULES[entity]) {
    const raw = out[rule.field];
    if (typeof raw !== "string" || raw.length === 0) continue; // فقط رشته‌های غیرخالی
    let normalized: string;

    switch (rule.kind) {
      case "name":
        normalized = normalizeName(raw);
        break;
      case "propertyCode":
        normalized = normalizePropertyCode(raw);
        break;
      case "requestCode":
        normalized = normalizeRequestCode(raw);
        break;
      case "mobile":
        normalized = normalizeMobile(raw);
        break;
      case "holo":
        normalized = normalizeDigitsOnly(raw);
        break;
      // ---- P6.5-04-e-v2: مشتق‌سازی لایه ۲ از لایه ۱ خام (سه‌لایه حقیقت) ----
      case "amount": {
        // rawPrice (+rawPriceUnit جدا) → price (ریال — §۳.۵ مرز واحد)
        const unit = typeof out.rawPriceUnit === "string" && out.rawPriceUnit.trim() ? ` ${out.rawPriceUnit.trim()}` : "";
        const price = normalizeAmount(raw + unit);
        if (Number.isFinite(price)) {
          if (out.price !== price) changedFields.push("price");
          out.price = price;
        } else if (raw.trim().length > 0) {
          invalidFields.push("price");
        }
        continue; // خود rawPrice عین منبع می‌ماند (لایه ۱ هرگز تغییر نمی‌کند)
      }
      case "area": {
        // rawArea → meterage (عدد ساده — بدون تفسیر واحد پول)
        const meterage = parsePersianNumber(raw);
        if (Number.isFinite(meterage)) {
          if (out.meterage !== meterage) changedFields.push("meterage");
          out.meterage = meterage;
        } else if (raw.trim().length > 0) {
          invalidFields.push("meterage");
        }
        continue; // خود rawArea عین منبع می‌ماند
      }
      case "jalaliDate": {
        // rawDate → contractDate — فقط وقتی مقدار معتبر موجود نیست (رکورد قدیمی/ناقص)
        const hasExisting =
          out.contractDate instanceof Date ||
          (typeof out.contractDate === "string" && out.contractDate.length > 0);
        if (!hasExisting) {
          const iso = normalizeJalaliDate(raw);
          if (iso) {
            out.contractDate = new Date(iso);
            changedFields.push("contractDate");
          } else if (raw.trim().length > 0) {
            invalidFields.push("contractDate");
          }
        }
        continue; // خود rawDate عین منبع می‌ماند
      }
      case "areaName":
      case "lineName": {
        const match = findLocationInRegistry(raw, registry);
        if (match) {
          areaMatched = true;
          if (rule.kind === "areaName") {
            // فیلد منطقه → هویت منطقه (چه مدخل خط باشد چه ناحیه، areaId/areaName والد معتبر است)
            if (out.areaId !== match.areaId) changedFields.push("areaId");
            out.areaId = match.areaId;
            if (out.areaName !== match.areaName) changedFields.push("areaName");
            out.areaName = match.areaName;
            normalized = match.areaName;
          } else if (match.kind === "line") {
            // فیلد محله → هویت محله (خط)
            if (out.lineId !== match.matchedId) changedFields.push("lineId");
            out.lineId = match.matchedId;
            normalized = match.matchedName;
          } else {
            // نام «منطقه» در فیلد محله → اطلاعات منطقه پر می‌شود؛ lineId نمی‌گیرد و نام فیلد پاک‌شده می‌ماند
            if (!out.areaId) {
              out.areaId = match.areaId;
              out.areaName = match.areaName;
              changedFields.push("areaId", "areaName");
            }
            normalized = normalizeName(raw);
          }
        } else {
          if (raw.trim().length > 0) areaUnmatched = true;
          normalized = normalizeName(raw);
        }
        if (out[rule.field] !== normalized) {
          if (!changedFields.includes(rule.field)) changedFields.push(rule.field);
          out[rule.field] = normalized;
        }
        if (normalized.length === 0 && raw.trim().length > 0) {
          invalidFields.push(rule.field);
        }
        continue;
      }
    }

    // B.3 (P6.5-04-v2) — مشتق‌سازی لایه ۲ از لایه ۱ خام: با target مقدار نرمال
    // در فیلد مقصد نوشته می‌شود و خود فیلد خام عین منبع دست‌نخورده می‌ماند؛
    // بدون target همان نرمال‌سازی درجای e-v2 (سازگاری ردیف‌های قدیمی بدون خام).
    // شمارش تغییر فقط وقتی است که «مقدار مقصد» واقعاً عوض شود (idempotency:
    // اجرای مجدد روی ردیف نرمال‌شده = صفر تغییر، حتی وقتی خام≠نرمال است).
    const dest = rule.target ?? rule.field;
    if (out[dest] !== normalized) {
      if (!changedFields.includes(dest)) changedFields.push(dest);
      out[dest] = normalized;
    }
    // رد صادقانه: ورودی غیرخالی → خروجی خالی (موبایل نامعتبر و…)
    if (normalized.length === 0 && raw.trim().length > 0) {
      if (!invalidFields.includes(dest)) invalidFields.push(dest);
    }
  }

  return {
    row: out as T,
    stats: {
      changedFields,
      invalidFields,
      areaMatched,
      areaUnmatched,
      key: dedupKey(entity, out),
    },
  };
}
