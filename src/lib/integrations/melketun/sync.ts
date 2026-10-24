/**
 * Melketun Sync Worker v3 — PN-047/گام اول-۳+۴ (دستور مالک ۱۴۰۵/۰۷/۲۹)
 * ---------------------------------------------------------------------------
 * ارتقای کامل بر PN-044/فاز ۳ + PN-046/گام اول-۱:
 *
 * کشف‌های PN-047 (کاوشگر download/pn047/):
 *   · MelketunPublicFilingPlus — نمای عمومی همهٔ شعب: ۱,۸۱۰ آگهی (رضانژاد تبریز
 *     ۱,۲۱۸ + آسمان تبریز ۵۹۲) با فیلد متراژ (size) و نام ملک (name) —
 *     در برابر ۴۹ آگهی نمای خصوصی قبلی.
 *   · PublicPotentials — نمای عمومی درخواست‌ها: ۳,۸۹۲ رکورد از سه شعبهٔ
 *     ملکتون در سطح شهر تبریز (رضانژاد تبریز ۲,۳۰۸ + آسمان تبریز ۱,۵۷۶ +
 *     ۱۷ شهریور ۶) — عین دستور مالک: «شعب دیگر ملکتون در سطح شهر تبریز».
 *   · specialists (۸۳ کاربر CRM) + حل نام/موبایل از contacts/getUserFromVtigerId
 *     → فهرست M10 کارشناسان ملکتون.
 *   · قیف فروش هر دو ماژول (funnel) → بینش M9 معاملات (مراحل contract/win فعلاً ۰).
 *   · myFilings — ۴۹ آگهی خصوصی با مالک/موبایل/آدرس/GPS → غنی‌سازی.
 *   · صفحات خراب CRM (خطای ۵۰۰ دائمی): PublicPotentials صفحات ۳۳۹/۳۷۲/۳۸۵/۳۹۰ —
 *     skip صادقانه با ثبت در گزارش (هر کدام ۱۰ رکورد نام‌دسترس).
 *
 * نگاشت (هویت PN-047 — کاشی‌های ملکتون):
 *   · M7  آگهی     : filings عمومی → PropertyRecord   · tenantId='melketun'
 *   · M8  درخواست  : potentials عمومی → RequestRecord · tenantId='melketun'
 *   · M9  معاملات  : CRM ماژول مستقل ندارد → قیف فروش واقعی در RefListCache
 *                    («melketun-funnel») برای بینش صادقانهٔ خط لوله
 *   · M10 کارشناسان: specialists + کاربران حل‌شده → ExpertRecord · tenantId='melketun'
 *
 * فیلتر شهر تبریز (در مبدأ — PN-045/فاز ۱ + گسترش PN-047):
 *   همهٔ شعب ملکتون در سطح شهر تبریز‌اند (عین دستور مالک PN-047): نام شعب
 *   شناخته‌شده (رضانژاد تبریز · آسمان تبریز · ۱۷ شهریور) + واژهٔ تبریز +
 *   محله‌های شناخته‌شدهٔ تبریز. رکورد غیرتبریز → skip صادقانه (هرگز حذف).
 *
 * Doctrine: no LLM, no cost, no auto_execute, sacred data (صفر حذف — فقط upsert
 * افزودنی/ایدمپوتنت). Secrets: upload/.runtime/melketun-secrets.json (Persistent
 * Zone — هرگز در کد/گیت/لاگ). Law 18: رمز هرگز در لاگ چاپ نمی‌شود.
 */

import fs from "fs";
import path from "path";
import { db } from "@/lib/db";
import { recordMelketunConnection } from "@/lib/integrations/melketun";
import { stripProtectedNulls } from "@/lib/integrations/melketun/protected-nulls"; // G1/G2 (DIR-PN048-007)

const SECRET_FILE = path.join(process.cwd(), "upload/.runtime/melketun-secrets.json");
export const REQUEST_TIMEOUT_MS = 30_000;
export const PAGE_DELAY_MS = 350; // ادب در برابر سرور (rate-limit risk #4 — CRM زیر فشار ۵۰۰ می‌دهد)
const MAX_PAGES = 500; // سقف ایمن (کشف: filings=۱۴۸ صفحه · potentials=~۳۹۴ صفحه)
/** صفحات خراب پایدار CRM (۵۰۰ دائمی) — skip صادقانه (کشف PN-047) */
export const KNOWN_BAD_POTENTIAL_PAGES = new Set<number>([339, 372, 385, 390]);

/** کلید tenant ملکتون در جداول مشترک. تبریز = 'melk-tabriz' (P6.5-02 §۱۴ — دست‌نخورده). */
export const MELKETUN_TENANT_ID = "melketun" as const;

// ── PN-045/فاز ۱ + گسترش PN-047 — فیلتر شهر تبریز (در مبدأ، نه UI — اصل ۵) ──
/** واژه‌های دالّ بر تبریز در نام آژانس/شعبه */
const TABRIZ_AGENCY_KEYWORDS = ["تبریز", "tabriz", "Tabriz", "TABRIZ", "17 شهریور", "۱۷ شهریور", "هفده شهریور"];
/**
 * شعب ملکتون در سطح شهر تبریز (عین دستور مالک PN-047/گام اول-۴ — «ملکتون در سطح
 * شهر تبریز دارای شعب مختلف می‌باشد»). کشف از دادهٔ عمومی CRM: سه شعبه فعال.
 */
export const MELKETUN_TABRIZ_BRANCHES: readonly string[] = [
  "رضانژاد تبریز",
  "آسمان تبریز",
  "17 شهریور",
] as const;

/** محله‌های شناخته‌شدهٔ تبریز (از توزیع واقعی دادهٔ عمومی CRM PN-047) */
const TABRIZ_NEIGHBORHOOD_KEYWORDS = [
  "مرزداران", "ولیعصر", "نصر", "شهرک باغمیشه", "باغمیشه", "الهیه", "رشدیه",
  "فرشته جنوبی", "فرشته شمالی", "ولی امر", "ائل‌گلی", "ائل گلی", "ایل گلی",
  "استانداری", "زعفرانیه", "میرداماد", "شهید رجایی", "گلشهر", "یاغچیان",
  "چایکنار", "خاوران", "زیتون", "قره‌آغاج", "قره آغاج",
  "باسمنج", "خسروشاه", "کوی سیلاب", "سیلاب", "طرنج", "بهشتی",
  "سیه‌رون", "سیهرون", "آبرسان", "مرجان", "نماز",
  "امیرخیز", "مهرگان",
  // PN-047 — از توزیع واقعی ۱,۸۱۰ آگهی عمومی (۲۵ محلهٔ برتر):
  "مارالان", "پرواز", "رسالت", "منظریه", "رضانژاد شمالی", "آبرسان", "منصور",
  "کوی فیروز", "پاستور", "ائل‌گلی", "قطران", "ابوریحان", "حافظ",
  "اشرفی لاله", "شهناز", "عجبشیر", "خلیل‌آباد", "امام خمینی", "شریعتی", "ارتش",
];

/** آیا نام آژانس دالّ بر تبریز است؟ (معیار اصلی) */
function isTabrizAgency(agency: unknown): boolean {
  const s = String(agency ?? "");
  return TABRIZ_AGENCY_KEYWORDS.some((k) => s.includes(k));
}

/** آیا متن منطقه/محله دالّ بر تبریز است؟ (معیار دوم — چندمحله‌ای با کاما) */
function isTabrizArea(area: unknown): boolean {
  const s = String(area ?? "");
  if (!s.trim()) return false;
  return TABRIZ_NEIGHBORHOOD_KEYWORDS.some((k) => s.includes(k));
}

/**
 * حکم تبریز بودن یک رکورد ملکتون — زنجیرهٔ fallback (قانون ۱۷ دستور):
 *   ۱. agency تبریز (واژهٔ تبریز یا نام شعب شناخته‌شدهٔ ملکتون) → TABRIZ
 *   ۲. area/areas تبریز (محله‌های شناخته‌شده) → TABRIZ
 *   ۳. هر دو نامشخص → UNKNOWN (skip صادقانه + گزارش، نه حذف)
 */
function tabrizVerdict(row: { agency?: unknown; area?: unknown }): "TABRIZ" | "UNKNOWN" {
  if (isTabrizAgency(row.agency)) return "TABRIZ";
  if (isTabrizArea(row.area)) return "TABRIZ";
  return "UNKNOWN";
}

interface MelketunSecrets {
  crm: { base_url: string; username: string; password: string };
  public: { base_url: string };
}

function loadSecrets(): MelketunSecrets {
  const raw = fs.readFileSync(SECRET_FILE, "utf8");
  return JSON.parse(raw) as MelketunSecrets;
}

// ── Cookie jar سبک (بدون وابستگی خارجی) ─────────────────────────────────────
class CookieJar {
  private jar = new Map<string, string>();

  absorb(res: Response) {
    const rawList: string[] =
      typeof res.headers.getSetCookie === "function"
        ? res.headers.getSetCookie()
        : (res.headers.get("set-cookie") ?? "").split(/,(?=[^;]+=)/).filter(Boolean);
    for (const line of rawList) {
      const [pair] = line.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) this.jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }

  header(): string {
    return [...this.jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  decoded(name: string): string {
    const v = this.jar.get(name);
    if (!v) return "";
    try {
      return decodeURIComponent(v);
    } catch {
      return v;
    }
  }
}

// ── استخراج JSON اینرسیا از HTML ────────────────────────────────────────────
function unescapeHtml(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** HTML صفحهٔ Inertia → props (JSON تمیز داخل data-page — بدون cheerio) */
function extractInertiaProps(html: string): Record<string, unknown> | null {
  const m = html.match(/<div[^>]*id="app"[^>]*data-page="([^"]*)"/);
  if (!m) return null;
  try {
    const page = JSON.parse(unescapeHtml(m[1])) as {
      props?: Record<string, unknown>;
      component?: string;
    };
    if (page.component?.startsWith("errors/")) return null; // 403/404 صفحهٔ خطاست
    return page.props ?? null;
  } catch {
    return null;
  }
}

// ── نرمال‌سازی اعداد فارسی/عربی → Float ────────────────────────────────────
function toFloat(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) && raw > 0 ? raw : null;
  if (typeof raw !== "string") return null;
  const normalized = raw
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[,،]/g, "")
    .trim();
  if (!normalized || !/^\d+(\.\d+)?$/.test(normalized)) return null;
  const n = Number(normalized);
  return n > 0 ? n : null;
}

/** «مقدار قابل صفر بودن»: ۰ دادهٔ واقعی است (فروش = بدون رهن/اجاره؛ صفر ≠ تهی). */
function toFloatOrZero(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") return Number.isFinite(raw) && raw >= 0 ? raw : null;
  if (typeof raw !== "string") return null;
  const normalized = raw
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[,،]/g, "")
    .trim();
  if (!normalized || !/^\d+(\.\d+)?$/.test(normalized)) return null;
  const n = Number(normalized);
  return n >= 0 ? n : null;
}

/** پارس متراژ (size) — «۱۴۸» یا ۱۴۸ یا «148.5» → Float (۰ مجاز) */
function toMeterage(raw: unknown): number | null {
  const v = toFloatOrZero(raw);
  return v !== null && v > 0 ? v : null; // متراژ ۰ = تهی واقعی است (صادقانه)
}

// ── PN-049/گام ۱-الف — تجزیهٔ مناطق چندگانهٔ CRM ملکتون ─────────────────────
/**
 * رشتهٔ خام مناطق CRM ملکتون به‌صورت «آبرسان , دارایی , رضانژاد جنوبی»
 * (جداکنندهٔ «,» لاتین و «،» فارسی) می‌آید؛ شواهد DB: ۷۵۹ رکورد از ۱٬۱۱۳
 * رکورد دارای-منطقه، رشتهٔ چندمنطقه‌ای‌اند. تجزیهٔ نادرست قبلی کل رشته را
 * «یک منطقه» ذخیره می‌کرد و سلول «فایل مناطق» (>۳ منطقه — P6526/ب) هرگز
 * برای ملکتون فعال نمی‌شد؛ با تجزیهٔ صحیح، ستون مناطق ملکتون عین ستون
 * مناطق فهرست درخواست ملک تبریز رفتار می‌کند (۱-۳ درون‌خطی · >۳ فایل).
 * نیم‌فاصله و پرانتز درون‌نام حفظ می‌شود — فقط جداکننده‌ها بریده می‌شوند.
 */
export function parseMelketunAreas(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return String(raw)
    .split(/[،,]/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

// ── پارس تاریخ شمسی CRM ملکتون → Date ─────────────────────────────────────
import { jalaliToGregorian as melJalaliToGregorian } from "@/lib/jalali";
const MELKETUN_MONTHS: Record<string, number> = {
  "فروردین": 1, "اردیبهشت": 2, "خرداد": 3, "تیر": 4, "مرداد": 5, "شهریور": 6,
  "مهر": 7, "آبان": 8, "آذر": 9, "دی": 10, "بهمن": 11, "اسفند": 12,
};
function parseMelketunJalali(raw: unknown): Date | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const m = raw.match(/(\d{1,2})\s+([\u0600-\u06FF]+)\s+(\d{4})/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = MELKETUN_MONTHS[m[2]];
  const year = Number(m[3]);
  if (!month || !day || !year) return null;
  const tm = raw.match(/(\d{1,2}):(\d{2})/);
  const [gYear, gMonth, gDay] = melJalaliToGregorian(year, month, day);
  const d = new Date(Date.UTC(gYear, gMonth - 1, gDay, tm ? Number(tm[1]) : 0, tm ? Number(tm[2]) : 0));
  return Number.isFinite(d.getTime()) ? d : null;
}

// ── لاگین نشست (فاز ۰ تأیید: POST /login-store) ────────────────────────────
// PN-049/گام ۳ — export برای اسکریپت سینک تکه‌ای (resume/checkpoint)؛ منبع یگانه.
export async function crmLogin(baseUrl: string, username: string, password: string, errors: string[]): Promise<CookieJar> {
  const jar = new CookieJar();

  const loginPage = await fetch(`${baseUrl}/login`, {
    redirect: "follow",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  jar.absorb(loginPage);
  if (!loginPage.ok) {
    errors.push(`GET /login → HTTP ${loginPage.status}`);
    return jar;
  }

  const body = new URLSearchParams({ Username: username, Password: password });
  const loginRes = await fetch(`${baseUrl}/login-store`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: jar.header(),
      "X-XSRF-TOKEN": jar.decoded("XSRF-TOKEN"),
      Accept: "application/json, text/html;q=0.9",
    },
    body,
    redirect: "manual", // 302 = موفق (Laravel ریدایرکت می‌کند)
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  jar.absorb(loginRes);

  if (!(loginRes.status === 302 || loginRes.status === 303)) {
    errors.push(`POST /login-store → HTTP ${loginRes.status}`);
    return jar;
  }

  const verify = await fetch(`${baseUrl}/dashboard`, {
    headers: { Cookie: jar.header() },
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (verify.status !== 200) {
    errors.push(`login verify: GET /dashboard → ${verify.status} (نه 200 — احراز هویت کامل نشد)`);
  }
  return jar;
}

// ── واکشی یک ماژول با تمام صفحات (v3: retry + skip هوشمند صفحات خراب) ──────
interface InertiaRow {
  [key: string]: unknown;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** fetch با retry بر خطاهای 5xx (CRM زیر فشار موقت ۵۰۰ می‌دهد) */
async function fetchPage(url: string, jar: CookieJar, tries = 3): Promise<Response> {
  let last: Response | null = null;
  for (let i = 0; i < tries; i++) {
    const r = await fetch(url, {
      headers: { Cookie: jar.header(), Accept: "text/html" },
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (r.status < 500) return r;
    last = r;
    await r.text().catch(() => "");
    await sleep(1500 * (i + 1));
  }
  return last!;
}

interface ModuleFetchResult {
  rows: InertiaRow[];
  /** صفحات skip‌شده به دلیل خطای دائمی سرور (هر صفحه = ۱۰ رکورد نام‌دسترس) */
  badPages: number[];
}

export async function fetchModule(
  baseUrl: string,
  jar: CookieJar,
  pagePath: (n: number) => string,
  propKey: string,
  errors: string[],
  knownBadPages: Set<number> = new Set(),
): Promise<ModuleFetchResult> {
  const all: InertiaRow[] = [];
  const badPages: number[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    if (knownBadPages.has(page)) {
      badPages.push(page);
      continue; // skip صادقانه — صفحهٔ خراب پایدار CRM (کشف PN-047)
    }
    const url = `${baseUrl}${pagePath(page)}`;
    try {
      const res = await fetchPage(url, jar);
      if (res.status !== 200) {
        // skip هوشمند: اگر صفحهٔ بعدی سالم بود → این صفحه رکورد معیوب دارد؛
        // اگر بعدی هم ۵۰۰ بود → قطعی موقت سرور؛ توقف صادقانه.
        const next = await fetchPage(`${baseUrl}${pagePath(page + 1)}`, jar, 1);
        if (next.status === 200) {
          badPages.push(page);
          continue;
        }
        if (page === 1) errors.push(`${pagePath(1)} → HTTP ${res.status}`);
        break;
      }
      const html = await res.text();
      const props = extractInertiaProps(html);
      if (!props) {
        if (page === 1) errors.push(`${pagePath(1)}: Inertia props not found`);
        break;
      }
      const bucket = props[propKey] as { data?: InertiaRow[] } | undefined;
      const rows = Array.isArray(bucket?.data) ? (bucket!.data as InertiaRow[]) : [];
      if (rows.length === 0) break; // صفحهٔ خالی = پایان داده
      all.push(...rows);
      if (rows.length < 10) break; // آخرین صفحهٔ ناقص
      await sleep(PAGE_DELAY_MS);
    } catch (e) {
      errors.push(`${pagePath(page)}: ${e instanceof Error ? e.message : String(e)}`);
      break;
    }
  }
  return { rows: all, badPages };
}

// ── قیف فروش (بینش M9) — fetch تک‌صفحه ─────────────────────────────────────
async function fetchFunnel(baseUrl: string, jar: CookieJar, funnelPath: string, propKey: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetchPage(`${baseUrl}${funnelPath}`, jar);
    if (res.status !== 200) return null;
    const props = extractInertiaProps(await res.text());
    return (props?.[propKey] as Record<string, unknown>) ?? null;
  } catch {
    return null;
  }
}

// ── حل نام/موبایل کاربران vtiger (با کش پایدار RefListCache) ────────────────
export interface ResolvedUser { name: string | null; mobile: string | null }
const USER_CACHE_KEY = "melketun-users";

export async function resolveVtigerUsers(
  baseUrl: string,
  jar: CookieJar,
  vtigerIds: string[],
  errors: string[],
): Promise<Record<string, ResolvedUser>> {
  // کش: حل‌شده‌های قبلی (سرور شکننده است — هر sync فقط ناتمام‌ها را می‌گیرد)
  let cache: Record<string, ResolvedUser> = {};
  try {
    const row = await db.refListCache.findUnique({ where: { key: USER_CACHE_KEY } });
    if (row) cache = JSON.parse(row.dataJson) as Record<string, ResolvedUser>;
  } catch { /* کش خالی — شروع تازه */ }

  for (const vt of vtigerIds) {
    if (cache[vt]?.name) continue; // حل‌شده — بدون درخواست تازه
    const num = vt.replace(/^1[39]x/, "");
    try {
      const res = await fetchPage(`${baseUrl}/contacts/getUserFromVtigerId/${num}`, jar);
      if (res.status === 200) {
        const text = await res.text();
        let user: { name?: string; mobile?: string } | null = null;
        const props = extractInertiaProps(text);
        user = (props?.user as { name?: string; mobile?: string } | undefined) ?? null;
        if (!user) {
          try { user = (JSON.parse(text) as { user?: { name?: string; mobile?: string } }).user ?? null; } catch { /* خام */ }
        }
        if (user?.name) cache[vt] = { name: user.name.trim(), mobile: user.mobile?.trim() ?? null };
      }
      await sleep(300); // ادب — این مسیر حساس‌تر است (۴ خطای ۵۰۰ در کاوش)
    } catch (e) {
      errors.push(`resolveUser ${vt}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 100));
    }
  }

  try {
    await db.refListCache.upsert({
      where: { key: USER_CACHE_KEY },
      create: { key: USER_CACHE_KEY, dataJson: JSON.stringify(cache) },
      update: { dataJson: JSON.stringify(cache) },
    });
  } catch (e) {
    errors.push(`user-cache write: ${e instanceof Error ? e.message : String(e)}`.slice(0, 100));
  }
  return cache;
}

// ── نگاشت فیلدها ─────────────────────────────────────────────────────────────
export interface FilingRow {
  id: string; full_id?: string; name?: string; code?: string; saleType?: string; fileType?: string;
  area?: string; price?: string | number; prepayment?: string; rent?: string; size?: string | number;
  assignedUser?: string; phone?: string; agency?: string; source?: string; status?: string;
  ownerName?: string; createdTime?: string; images?: string[];
}

interface PotentialRow {
  id: string; full_id?: string; code?: string; potentialName?: string; customerType?: string;
  price?: string | number; rent?: number | string; prepayment?: number | string; areas?: string;
  contactName?: string; contactMobile?: string; agency?: string; assignedUser?: string; propertyType?: string;
  createdTime?: string; starred?: boolean; status?: string; source?: string;
}

export interface MyFilingRow {
  code?: string; owner_name?: string; owner_phone?: string; price?: string;
  address?: string; longitude?: string; latitude?: string;
}

export function filingToProperty(f: FilingRow, runId: string, expertName: string | null, ownerEnrich?: MyFilingRow | null) {
  const saleType = f.saleType?.trim() || null;
  const fileType = f.fileType?.trim() || null;
  const area = f.area?.trim() || null;
  const agency = f.agency?.trim() || null;
  const details: { label: string; value: string }[] = [
    { label: "نام ملک", value: f.name ?? "" },
    { label: "نوع ملک", value: fileType ?? "" },
    { label: "نوع معامله", value: saleType ?? "" },
    { label: "منطقه", value: area ?? "" },
    { label: "متراژ", value: f.size != null ? String(f.size) : "" },
    { label: "پیش‌پرداخت", value: String(f.prepayment ?? "") },
    { label: "اجاره", value: String(f.rent ?? "") },
    { label: "آژانس", value: agency ?? "" },
    { label: "کارشناس مسئول", value: expertName ?? String(f.assignedUser ?? "") },
    { label: "منبع", value: f.source ?? "" },
    { label: "زمان ثبت (ملکتون)", value: f.createdTime ?? "" },
    { label: "شناسهٔ کامل", value: f.full_id ?? f.id },
  ].filter((d) => d.value !== "");

  const deposit = toFloatOrZero(f.prepayment);
  const rent = toFloatOrZero(f.rent);
  const isRental = saleType?.includes("اجاره") === true || (rent ?? 0) > 0 || saleType?.includes("رهن") === true;

  return {
    id: f.id, // شناسهٔ vtiger ('71x…') — بدون تصادم با objectId های ARM
    propertyCode: f.code?.trim() || f.id, // 'ME8418' — بدون تصادم با کدهای عددی ARM
    // PN-047 — نام واقعی ملک از CRM («آپارتمان-148متری») + fallback ساختاری
    title: f.name?.trim() || [saleType, fileType, area && `در ${area}`].filter(Boolean).join(" ") || null,
    status: f.status?.trim() || null,
    // کارشناس مسئول (حل‌شده از vtiger)؛ بدون حل → آژانس (الگوی کاتالوگ M7)
    ownerName: expertName ?? agency,
    // مالک واقعی — از غنی‌سازی myFilings (آگهی‌های خصوصی در دسترس)؛ اگر نمای CRM
    // برای حساب مدیر فیلد مالک بدهد، خودکار جاری می‌شود (PN-049/گام ۲-ب —
    // آمادگی حساب مدیر؛ نمای عمومی فعلی این فیلد را نمی‌دهد — شاهد buffer)
    rawOwnerName: ownerEnrich?.owner_name?.trim() ?? (f.ownerName?.trim() || null),
    ownerMobile: ownerEnrich?.owner_phone?.replace(/\D/g, "") ?? f.phone?.replace(/\D/g, "") ?? null,
    address: ownerEnrich?.address?.trim() ?? null, // آدرس دقیق (فقط برای ۴۹ آگهی خصوصیِ در دسترس)
    areaName: area,
    propertyTypeName: fileType,
    tradeTypeName: saleType,
    price: toFloat(f.price),
    // PN-047 — متراژ: فیلد size نمای عمومی (۱,۷۹۲ از ۱,۸۱۰ پر — پوشش ۹۹٪)
    meterage: toMeterage(f.size),
    // بودجهٔ اجاره‌ای — ۰ هم دادهٔ واقعی است (فروش = بدون رهن/اجاره)
    depositPrice: deposit,
    rentPrice: rent,
    isRental,
    imageCount: (f.images ?? []).length > 0 ? (f.images as string[]).length : null,
    // شهر/استان — استنتاج صادقانه: همهٔ شعب ملکتون در سطح شهر تبریز‌اند (دستور PN-047)
    cityName: "تبریز",
    stateName: "آذربایجان شرقی",
    armBranchTitle: agency, // شعبهٔ ملکتون (رضانژاد تبریز · آسمان تبریز · ۱۷ شهریور)
    createdAt: parseMelketunJalali(f.createdTime), // تاریخ ثبت واقعی CRM (شمسی → میلادی)
    detailsJson: JSON.stringify(details),
    tenantId: MELKETUN_TENANT_ID,
    sourceRunId: runId,
    rawPrice: f.price != null ? String(f.price) : null,
    rawSourceVersion: "melketun-crm-public",
    extractedAt: new Date(),
    extractionBatchId: runId,
    normalizationVersion: "pn047-v3",
  };
}

function potentialToRequest(p: PotentialRow, runId: string, expertName: string | null) {
  const inputs = {
    customerType: p.customerType ?? null,
    rent: p.rent ?? null,
    prepayment: p.prepayment ?? null,
    price: p.price ?? null,
    agency: p.agency ?? null,
    assignedUser: p.assignedUser ?? null,
    starred: p.starred ?? null,
    source: p.source ?? null,
    createdTimeMelketun: p.createdTime ?? null,
    fullId: p.full_id ?? p.id,
  };
  const priceVal = toFloat(p.price);
  // PN-049/گام ۱-الف — مناطق چندگانهٔ CRM به آرایهٔ تمیز تجزیه می‌شوند
  // (قبلاً کل رشتهٔ «آ , ب , ج» به‌عنوان یک منطقه ذخیره می‌شد — ریشهٔ شکایت مالک)
  const areaNames = parseMelketunAreas(p.areas);

  return {
    id: p.id, // شناسهٔ vtiger ('13x…') — بدون تصادم با cuid های ARM
    requestCode: p.code?.trim() || p.id, // 'POT4396' — بدون تصادم با کدهای عددی ARM
    source: "melketun-crm",
    customerName: p.contactName?.trim() || null,
    // PN-049/گام ۲-ب — آمادگی حساب مدیر: اگر نمای CRM برای حساب‌های با دسترسی
    // بالاتر موبایل متقاضی بدهد، خودکار جاری می‌شود؛ نمای عمومی فعلی این فیلد
    // نمی‌دهد (شاهد buffer ۱۴۰۵/۰۸/۰۱) — این مسیر برای حساب فعلی بی‌اثر است.
    customerMobile: p.contactMobile?.replace(/\D/g, "") || null,
    title: p.potentialName?.trim() || null,
    areaNamesJson: areaNames.length > 0 ? JSON.stringify(areaNames) : null,
    propertyTypeName: p.propertyType?.trim() || null,
    tradeTypeName: p.customerType?.includes("اجاره") ? "رهن و اجاره" : p.customerType?.includes("خرید") ? "فروش" : null,
    priceFrom: priceVal,
    priceTo: priceVal,
    // بودجهٔ رهن/اجاره (ستون‌های فهرست M8 ملکتون — §۱۴ افزودنی)
    depositBudget: toFloatOrZero(p.prepayment),
    rentBudget: toFloatOrZero(p.rent),
    urgent: null, // فیلد معادل در CRM ملکتون وجود ندارد (صادقانه — قانون ۱۴)
    inputsJson: JSON.stringify(inputs),
    status: p.status?.trim() || "فعال",
    actorCode: p.assignedUser ?? "melketun-sync",
    // PN-047 — نام کارشناس مسئول حل‌شده؛ بدون حل → آژانس
    actorName: expertName ?? p.agency?.trim() ?? "هماهنگ‌سازی ملکتون",
    // PN-047/گام اول-۴ — شعبهٔ ملکتون (agency پتانسیل — سه شعبهٔ سطح تبریز)
    armBranchTitle: p.agency?.trim() || null,
    stateName: "آذربایجان شرقی",
    cityName: "تبریز",
    tenantId: MELKETUN_TENANT_ID,
    sourceRunId: runId,
    rawCustomerName: p.contactName ?? null,
    rawSourceVersion: "melketun-crm-public",
    extractedAt: new Date(),
    extractionBatchId: runId,
    normalizationVersion: "pn047-v3",
    createdAt: parseMelketunJalali(p.createdTime) ?? undefined, // تاریخ ثبت واقعی CRM
    // spaceFrom/roomsFrom و… در دادهٔ ملکتون موجود نیست — null می‌مانند (صادقانه)
  };
}

// ── نتایج ─────────────────────────────────────────────────────────────────────
export interface SyncResult {
  ok: boolean;
  tenantId: typeof MELKETUN_TENANT_ID;
  fetched: { listings: number; requests: number; transactions: number; experts: number };
  upserted: { listings: number; requests: number; transactions: number; experts: number };
  /** فیلتر تبریز (در مبدأ) — رکوردهای skip‌شده (گزارش صادقانه، قانون ۱۴) */
  skippedByCityFilter: { listings: number; requests: number };
  skippedSamples: { code: string; agency: string; area: string }[];
  /** صفحات خراب CRM (خطای ۵۰۰ دائمی) — هر صفحه ۱۰ رکورد نام‌دسترس (PN-047) */
  badPages: { listings: number[]; requests: number[] };
  /** رکوردهای با کد تکراری در خود CRM (رکورد قدیمی‌تر skip می‌شود — تازه‌ترین می‌ماند) */
  skippedDuplicates: { listings: number; requests: number };
  /** شعب ملکتون دیده‌شده در این sync (همگی در سطح شهر تبریز — دستور مالک) */
  branchesSeen: string[];
  /** قیف فروش M9 (بینش معاملات — CRM ماژول مستقل ندارد) */
  funnel: { filings: Record<string, unknown> | null; potentials: Record<string, unknown> | null };
  errors: string[];
  durationMs: number;
}

const FUNNEL_CACHE_KEY = "melketun-funnel";

/** ردیف‌های ازپیش‌واکشی‌شده — منبع: fetch زنده یا bootstrap از شاهدهای کاوش PN-047 */
export interface PrefetchedRows {
  filings: FilingRow[];
  potentials: PotentialRow[];
  specialists: { id: number; name: string }[];
  myFilings: MyFilingRow[];
  /** کش حل‌شدهٔ کاربران vtiger (ممکن است ناقص باشد — skip صادقانه) */
  users: Record<string, ResolvedUser>;
  funnel: { filings: Record<string, unknown> | null; potentials: Record<string, unknown> | null };
}

/**
 * هستهٔ upsert ملکتون v3 — ردیف‌های ازپیش‌واکشی‌شده (زنده یا bootstrap) →
 * جداول مشترک (tenantId='melketun'). فقط upsert (ایدمپوتنت) — صفر حذف (قانون ۶).
 */
export async function syncMelketunRows(rows: PrefetchedRows): Promise<SyncResult> {
  const t0 = Date.now();
  const result: SyncResult = {
    ok: false,
    tenantId: MELKETUN_TENANT_ID,
    fetched: { listings: rows.filings.length, requests: rows.potentials.length, transactions: 0, experts: rows.specialists.length },
    upserted: { listings: 0, requests: 0, transactions: 0, experts: 0 },
    skippedByCityFilter: { listings: 0, requests: 0 },
    skippedSamples: [],
    badPages: { listings: [], requests: [] },
    skippedDuplicates: { listings: 0, requests: 0 },
    branchesSeen: [],
    funnel: { filings: rows.funnel.filings, potentials: rows.funnel.potentials },
    errors: [],
    durationMs: 0,
  };
  const runId = `pn047-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;

  try {
    const expertNameOf = (vt: unknown): string | null => {
      const k = String(vt ?? "");
      return k ? (rows.users[k]?.name ?? null) : null;
    };

    // غنی‌سازی آگهی‌های خصوصی (مالک واقعی/موبایل/آدرس/GPS)
    const enrichByCode = new Map<string, MyFilingRow>();
    for (const mf of rows.myFilings) if (mf.code) enrichByCode.set(mf.code.trim(), mf);

    // ── حذف تکرار صادقانه — خود CRM کدهای تکراری دارد (کشف bootstrap: ۳ جفت کد)
    // برای هر کد، تازه‌ترین رکورد (بر اساس createdTime شمسی) می‌ماند؛ قدیمی‌تر skip
    // با گزارش — چون propertyCode در DB یگانه است (قانون طرح).
    const dedupeNewest = <T extends { code?: string; createdTime?: string }>(list: T[], bucket: "listings" | "requests"): T[] => {
      const byCode = new Map<string, T>();
      for (const r of list) {
        const code = (r.code ?? "").trim();
        if (!code) continue; // بی‌کد → خودش می‌ماند (id مستقل)
        const existing = byCode.get(code);
        if (!existing) { byCode.set(code, r); continue; }
        const tNew = parseMelketunJalali(r.createdTime)?.getTime() ?? 0;
        const tOld = parseMelketunJalali(existing.createdTime)?.getTime() ?? 0;
        if (tNew >= tOld) { byCode.set(code, r); }
        result.skippedDuplicates[bucket]++;
      }
      // رکوردهای بی‌کد هم حفظ می‌شوند (id مستقل)
      const kept = [...byCode.values()];
      for (const r of list) if (!(r.code ?? "").trim()) kept.push(r);
      return kept;
    };
    const filings = dedupeNewest(rows.filings, "listings");
    const potentials = dedupeNewest(rows.potentials, "requests");

    // شعب دیده‌شده (گزارش شفاف برای مالک — دستور گام اول-۴: آگهی + درخواست)
    const branchSet = new Set<string>();
    for (const r of rows.filings) {
      const a = String(r.agency ?? "").trim();
      if (a) branchSet.add(a);
    }
    for (const r of rows.potentials) {
      const a = String(r.agency ?? "").trim();
      if (a) branchSet.add(a);
    }
    result.branchesSeen = [...branchSet].sort();

    // ── upsert آگهی‌ها (PropertyRecord · M7) — فیلتر تبریز در مبدأ ──
    for (const f of filings) {
      try {
        if (tabrizVerdict({ agency: f.agency, area: f.area }) !== "TABRIZ") {
          result.skippedByCityFilter.listings++;
          if (result.skippedSamples.length < 10) {
            result.skippedSamples.push({ code: f.code ?? f.id, agency: String(f.agency ?? ""), area: String(f.area ?? "") });
          }
          continue;
        }
        const data = filingToProperty(f, runId, expertNameOf(f.assignedUser), enrichByCode.get((f.code ?? "").trim()) ?? null);
        try {
          // G1/G2 (DIR-PN048-007): update افزودنی — null هرگز روی دادهٔ پر نمی‌نشیند
          await db.propertyRecord.upsert({ where: { id: data.id }, create: data, update: stripProtectedNulls(data) });
        } catch (e) {
          // P2002 (کد تکراری): رکورد موجود با همین کد — از sync قدیمی (نمای خصوصی
          // PN-046) با id متفاوت. ادغام صادقانه: همان رکورد بر اساس کد آپدیت می‌شود
          // (id قدیمی حفظ · ownerNote دست‌نخورده — قانون دادهٔ مقدس).
          if ((e as { code?: string }).code !== "P2002") throw e;
          const { id: _drop, createdAt: _c, ...rest } = data;
          // G1/G2: ادغام هم افزودنی — rest بدون nullها (فیلد غنی‌سازی غایب ≠ پاک کردن دادهٔ پر)
          await db.propertyRecord.update({ where: { propertyCode: data.propertyCode }, data: stripProtectedNulls(rest) });
          result.skippedDuplicates.listings++;
        }
        result.upserted.listings++;
      } catch (e) {
        result.errors.push(`upsert filing ${f.id}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 160));
      }
    }

    // ── upsert درخواست‌ها (RequestRecord · M8) — فیلتر تبریز در مبدأ ──
    for (const p of potentials) {
      try {
        if (tabrizVerdict({ agency: p.agency, area: p.areas }) !== "TABRIZ") {
          result.skippedByCityFilter.requests++;
          if (result.skippedSamples.length < 10) {
            result.skippedSamples.push({ code: p.code ?? p.id, agency: String(p.agency ?? ""), area: String(p.areas ?? "") });
          }
          continue;
        }
        const data = potentialToRequest(p, runId, expertNameOf(p.assignedUser));
        try {
          // G1/G2 (DIR-PN048-007): update افزودنی — متقاضی پر هرگز پاک نمی‌شود
          await db.requestRecord.upsert({ where: { id: data.id }, create: data, update: stripProtectedNulls(data) });
        } catch (e) {
          // P2002 (کد درخواست تکراری) — ادغام بر اساس requestCode (ادغام صادقانه)
          if ((e as { code?: string }).code !== "P2002") throw e;
          const { id: _drop, createdAt: _c, ...rest } = data;
          // G1/G2: ادغام افزودنی — rest بدون nullها
          await db.requestRecord.update({ where: { requestCode: data.requestCode }, data: stripProtectedNulls(rest) });
          result.skippedDuplicates.requests++;
        }
        result.upserted.requests++;
      } catch (e) {
        result.errors.push(`upsert potential ${p.id}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 160));
      }
    }

    // ── upsert کارشناسان (ExpertRecord · M10) — specialists + پروفایل فعالیت واقعی ──
    const activityByExpert = new Map<string, { counts: Map<string, number>; total: number }>();
    for (const f of rows.filings) {
      const name = expertNameOf(f.assignedUser);
      const agency = String(f.agency ?? "").trim();
      if (!name || !agency) continue;
      const slot = activityByExpert.get(name) ?? { counts: new Map<string, number>(), total: 0 };
      slot.counts.set(agency, (slot.counts.get(agency) ?? 0) + 1);
      slot.total++;
      activityByExpert.set(name, slot);
    }
    const now = new Date();
    for (const s of rows.specialists) {
      try {
        const name = s.name?.trim();
        if (!name) continue;
        const activity = activityByExpert.get(name);
        // شعبهٔ اصلی = آژانسِ اکثریتِ آگهی‌های همان کارشناس (بدون فعالیت → صادقانه)
        let businessTitle = "ملکتون (بدون فعالیت ثبت‌شده)";
        if (activity && activity.counts.size > 0) {
          businessTitle = [...activity.counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
        }
        const isBranchAccount = name.startsWith("شعبه");
        const role = isBranchAccount
          ? "حساب شعبهٔ ملکتون"
          : ["مدیر CRM", "کنترل کیفیت داده"].includes(name)
            ? name
            : "کارشناس ملکتون";
        // موبایل حل‌شده از نگاشت vtiger (به نام) — جست‌وجوی معکوس کش کاربران
        let mobile = "";
        for (const u of Object.values(rows.users)) {
          if (u.name === name && u.mobile) { mobile = u.mobile.replace(/\D/g, ""); break; }
        }
        const data = {
          id: `melketun-user-${s.id}`, // شناسهٔ پایدار CRM specialists
          personnelCode: `MELK-${s.id}`, // کد پرسنلی ملکتون (بدون تصادم با تبریز)
          fullName: name,
          mobile, // تهی = «—» در UI (صادقانه — CRM برای همهٔ کاربران موبایل ندارد)
          role,
          businessTitle, // شعبهٔ اکثریت فعالیت — از دادهٔ واقعی آگهی‌ها
          active: true,
          createdAt: now, // تاریخ درج در داشبورد (CRM تاریخ عضویت specialists را نمی‌دهد — صادقانه)
          tenantId: MELKETUN_TENANT_ID,
          sourceRunId: runId,
          rawFullName: name,
          rawBusinessTitle: businessTitle,
          rawSourceVersion: "melketun-crm-specialists",
          extractedAt: now,
          extractionBatchId: runId,
          normalizationVersion: "pn047-v3",
        };
        // G1/G2 (DIR-PN048-007): آپدیت افزودنی — موبایل/نام کارشناس پر هرگز پاک نمی‌شود
        await db.expertRecord.upsert({ where: { id: data.id }, create: data, update: stripProtectedNulls(data) });
        // ── آینهٔ ExpertProfile (PN-044/کشف §۱۴): کاشی M10 کارشناسان از این جدول می‌خواند —
        // بدون این آینه فهرست ملکتون خالی می‌ماند. نگاشت: roleTitle=نقش CRM ·
        // branchTitle=شعبهٔ اکثریت فعالیت · businessTitle=کسب‌وکار پایه · شهر=تبریز (صادقانه).
        await db.expertProfile.upsert({
          where: { id: data.id },
          create: {
            id: data.id,
            tenantId: MELKETUN_TENANT_ID,
            personnelCode: data.personnelCode,
            fullName: data.fullName,
            mobile: data.mobile || null,
            roleTitle: role,
            branchTitle: businessTitle,
            branchCode: null,
            businessTitle: "ملکتون",
            city: "تبریز",
            state: "آذربایجان شرقی",
            active: true,
            saleCount: 0, // صادقانه — شمارش ARM برای کارشناسان ملکتون کاربرد ندارد
            rentCount: 0,
            syncedAt: now,
            createdAt: now,
          },
          // G1/G2 (DIR-PN048-007): mobile=null در sync بعدی موبایل حل‌شدهٔ قبلی را پاک نکند
          update: stripProtectedNulls({
            tenantId: MELKETUN_TENANT_ID,
            personnelCode: data.personnelCode,
            fullName: data.fullName,
            mobile: data.mobile || null,
            roleTitle: role,
            branchTitle: businessTitle,
            businessTitle: "ملکتون",
            city: "تبریز",
            state: "آذربایجان شرقی",
            active: true,
            syncedAt: now,
          }),
        });
        result.upserted.experts++;
      } catch (e) {
        result.errors.push(`upsert expert ${s.id}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 160));
      }
    }

    // ── ذخیرهٔ قیف فروش برای بینش M9 (RefListCache — همان الگوی expert-branch-map) ──
    if (result.funnel.filings || result.funnel.potentials) {
      try {
        const payload = {
          filingsFunnel: result.funnel.filings,
          potentialsFunnel: result.funnel.potentials,
          fetchedAt: new Date().toISOString(),
          branchesSeen: result.branchesSeen,
        };
        await db.refListCache.upsert({
          where: { key: FUNNEL_CACHE_KEY },
          create: { key: FUNNEL_CACHE_KEY, dataJson: JSON.stringify(payload) },
          update: { dataJson: JSON.stringify(payload) },
        });
      } catch (e) {
        result.errors.push(`funnel-cache write: ${e instanceof Error ? e.message : String(e)}`.slice(0, 120));
      }
    }

    // M9 معاملات: CRM ملکتون ماژول مستقل معاملات ندارد و قیف هم رکوردی در مراحل
    // contract/win ندارد (کشف PN-047) — صفر upsert صادقانه؛ بینش از قیف بالا.
    result.fetched.transactions = 0;
    result.upserted.transactions = 0;
    result.ok = result.errors.length === 0;
  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : String(e));
  }

  result.durationMs = Date.now() - t0;
  return result;
}

/**
 * هماهنگ‌سازی کامل ملکتون v3 → جداول مشترک (tenantId='melketun').
 * فاز ۱: fetch زنده از CRM (نمای عمومی همهٔ شعب) → فاز ۲: syncMelketunRows.
 * فقط upsert (افزودنی/ایدمپوتنت) — صفر حذف، صفر دست‌کاری دادهٔ تبریز (قانون ۶/۱۱).
 */
export async function syncMelketun(): Promise<SyncResult> {
  const t0 = Date.now();
  const errors: string[] = [];
  const loginOnly: SyncResult = {
    ok: false,
    tenantId: MELKETUN_TENANT_ID,
    fetched: { listings: 0, requests: 0, transactions: 0, experts: 0 },
    upserted: { listings: 0, requests: 0, transactions: 0, experts: 0 },
    skippedByCityFilter: { listings: 0, requests: 0 },
    skippedSamples: [],
    badPages: { listings: [], requests: [] },
    skippedDuplicates: { listings: 0, requests: 0 },
    branchesSeen: [],
    funnel: { filings: null, potentials: null },
    errors,
    durationMs: 0,
  };

  try {
    const secrets = loadSecrets();
    const base = secrets.crm.base_url.replace(/\/$/, "");
    const { username, password } = secrets.crm;

    const jar = await crmLogin(base, username, password, errors);
    const loginFailed = errors.some((e) => e.startsWith("POST /login-store") || e.startsWith("login verify"));
    // وضعیت اتصال پایدار (سوخت نوار وضعیت + تنظیمات) از هر sync واقعی
    recordMelketunConnection(!loginFailed, loginFailed ? errors.join(" · ") : `sync login OK (${username})`);
    if (loginFailed) {
      loginOnly.durationMs = Date.now() - t0;
      return loginOnly; // لاگین ناموفق — صفر sync (گزارش صادقانه، قانون ۱۴)
    }

    // ── M7: نمای عمومی آگهی‌های همهٔ شعب ملکتون (کشف PN-047) ──
    const filingsResult = await fetchModule(
      base, jar,
      (n) => `/MelketunPublicFilingPlus${n > 1 ? `/${n}` : ""}`,
      "filings", errors,
    );

    // ── M8: نمای عمومی درخواست‌های همهٔ شعب ملکتون (کشف PN-047) ──
    const potentialsResult = await fetchModule(
      base, jar,
      (n) => `/PublicPotentials${n > 1 ? `/${n}` : ""}`,
      "potentials", errors,
      KNOWN_BAD_POTENTIAL_PAGES,
    );

    // ── M9: قیف فروش (بینش معاملات — CRM ماژول مستقل ندارد، صادقانه) ──
    const filingsFunnel = await fetchFunnel(base, jar, "/Melketunfilingplus/funnel", "funnelData");
    const potentialsFunnel = await fetchFunnel(base, jar, "/Potentials/funnel", "funnelData");

    // ── M10: specialists (۸۳ کاربر CRM) + myFilings (غنی‌سازی مالک/موبایل/آدرس) ──
    let specialists: { id: number; name: string }[] = [];
    let myFilings: MyFilingRow[] = [];
    try {
      const sc = await fetchPage(`${base}/supports/valuations/create`, jar);
      if (sc.status === 200) {
        const props = extractInertiaProps(await sc.text());
        specialists = ((props?.specialists as { data?: { id: number; name: string }[] })?.data ?? []);
        myFilings = ((props?.myFilings as { data?: MyFilingRow[] })?.data ?? []);
      } else {
        errors.push(`supports/valuations/create → HTTP ${sc.status} (specialists نام‌دسترس)`);
      }
    } catch (e) {
      errors.push(`specialists: ${e instanceof Error ? e.message : String(e)}`.slice(0, 120));
    }

    // ── حل نام/موبایل کارشناسان (کش پایدار — فقط ناتمام‌ها) ──
    const vtigerIds = [...new Set<string>([
      ...filingsResult.rows.map((r) => String(r.assignedUser ?? "")),
      ...potentialsResult.rows.map((r) => String(r.assignedUser ?? "")),
    ])].filter(Boolean);
    const users = await resolveVtigerUsers(base, jar, vtigerIds, errors);

    const result = await syncMelketunRows({
      filings: filingsResult.rows as unknown as FilingRow[],
      potentials: potentialsResult.rows as unknown as PotentialRow[],
      specialists,
      myFilings,
      users,
      funnel: { filings: filingsFunnel, potentials: potentialsFunnel },
    });
    result.badPages = { listings: filingsResult.badPages, requests: potentialsResult.badPages };
    result.errors.unshift(...errors); // خطاهای فاز fetch هم گزارش می‌شوند
    result.ok = result.errors.length === 0;
    result.durationMs = Date.now() - t0; // زمان کل (fetch + upsert)
    return result;
  } catch (e) {
    loginOnly.errors.push(e instanceof Error ? e.message : String(e));
    loginOnly.durationMs = Date.now() - t0;
    return loginOnly;
  }
}
