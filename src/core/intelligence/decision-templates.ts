/**
 * کتابخانهٔ قالب‌های روایت فارسی موتور ۱۶ (PN-025 / فاز ۱۳-ج / ستون ۳)
 * ---------------------------------------------------------------------------
 * ۲۴ قالب (۸ توصیه + ۸ شاهد + ۸ کمربند) — صفر LLM، صفر فراخوانی خارجی:
 * روایت = جای‌گذاری متغیرهای واقعی در رشته‌های ثابت فارسی.
 *
 * قواعد زبانی (فصل ۶.۴ سند طراحی):
 *   · فعل معلوم اول جمله · عدد فارسی همیشه (faNumber) · ۳-۵ جمله در narrative
 *   · صفر اصطلاح انگلیسی در روایت کارشناس‌محور
 *
 * خلوص لایهٔ هوش: هیچ وابستگی به DB و هیچ فراخوانی شبکه‌ای (گارد audit-intelligence-boundary).
 */

/** شناسهٔ قالب‌ها — نوع لفظی (تایپوچهک کامپایلری) */
export const TEMPLATE_IDS = [
  // ── توصیه‌های اصلی (۸) ──
  "T_CALL_BUYER", "T_CALL_OWNER", "T_ADD_IMAGE", "T_PRICE_CUT",
  "T_REPOST", "T_MATCH_INFORM", "T_FOLLOWUP", "T_ARCHIVE_NOTE",
  // ── شواهد و دلایل (۸) ──
  "E_ATTENTION_TOP", "E_CAUSAL_DO", "E_COUNTERFACTUAL", "E_SIMULATION_BEST",
  "E_MEMORY_SEEN", "E_GRAPH_PATH", "E_MARKET_TREND", "E_DATA_MISSING",
  // ── کمربند و احترام (۸) ──
  "L_TTL_EXPIRED", "L_COOLDOWN_ACTIVE", "L_RATE_LIMIT", "L_REQUIRES_APPROVAL",
  "L_NO_SPAM", "L_UPDATED_SINCE", "L_RISK_HIGH", "L_ASLEEP",
] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

/** بدنهٔ قالب‌ها — {var} = جای متغیر (تست کامل‌بودن متغیرها) */
export const TEMPLATES: Readonly<Record<TemplateId, string>> = {
  // ═══ توصیه‌های اصلی ═══
  T_CALL_BUYER: "به {buyerName} زنگ بزن — احتمال پاسخ‌گویی {probability}٪. دلیل: {reason}",
  T_CALL_OWNER: "با مالکِ {propertyCode} تماس بگیر — {reason}",
  T_ADD_IMAGE: "برای آگهی {propertyCode} نخستین عکس را بگذار — اثر بر احتمال معامله: {delta} واحد",
  T_PRICE_CUT: "قیمت {propertyCode} را {percent}٪ کم کن — سناریوی پادواقع: {scenario}",
  T_REPOST: "آگهی {propertyCode} را بازنشر کن — بازدید به میانهٔ بازار می‌رسد",
  T_MATCH_INFORM: "این آگهی را به {buyerName} پیشنهاد بده — {pathCount} مسیر ارتباطی یافت شد",
  T_FOLLOWUP: "پیگیریِ {buyerName} سر رسیده — آخرین تماس {daysAgo} روز پیش بود",
  T_ARCHIVE_NOTE: "پروندهٔ {itemId} آرشیو شد — امتیاز اهمیت زیر آستانه افتاد",

  // ═══ شواهد و دلایل ═══
  E_ATTENTION_TOP: "آگهی {propertyCode} امروز نمرهٔ توجه {score} دارد ({reason})",
  E_CAUSAL_DO: "اثر {action} بر احتمال معامله: {delta} واحد (گراف علّی، {n} نمونه)",
  E_COUNTERFACTUAL: "اگر {action} می‌شد، احتمال {change} بود — نه آنچه واقع شد",
  E_SIMULATION_BEST: "در مقایسهٔ چهار اقدام، «{best}» بالاترین امتیاز را دارد",
  E_MEMORY_SEEN: "این بستر تاکنون {count} بار در استدلال نقش داشته (آخرین: {lastAt})",
  E_GRAPH_PATH: "{from} از مسیر {via} به {to} وصل است — وزن مسیر {weight}",
  E_MARKET_TREND: "شاخص منطقهٔ {area} در {horizon} روز اخیر {trend}٪ تغییر کرده",
  E_DATA_MISSING: "شاهد کافی نیست — توصیه با اطمینان پایین (ریسک بالا)",

  // ═══ کمربند و احترام ═══
  L_TTL_EXPIRED: "این توصیه منقضی شده — برای توصیهٔ تازه، وضعیت را به‌روز کن",
  L_COOLDOWN_ACTIVE: "توصیهٔ مشابه {category} برای این بستر {hours} ساعت دیگر قابل ارائه است",
  L_RATE_LIMIT: "سقف توصیه‌های امروز پر شده — فردا صبح اولین توصیه همین‌جا است",
  L_REQUIRES_APPROVAL: "این توصیه نیازمند تأیید شماست — سامانه هرگز خودش اجرا نمی‌کند",
  L_NO_SPAM: "توصیهٔ قبلی هنوز معتبر است — تا انقضا تکرار نمی‌شود",
  L_UPDATED_SINCE: "وضعیت از توصیهٔ قبلی تغییر کرده — توصیهٔ تازه ساخته شد",
  L_RISK_HIGH: "ریسک بالا: {reason} — با احتیاط و تأیید انسانی",
  L_ASLEEP: "مغز برای این بستر فعلاً ساکت است — چون توصیهٔ معتبری سر جایش است",
};

/** نوع متغیرهای مجاز هر قالب — برای اعتبارسنجی (fail-loud) */
export const TEMPLATE_VARIABLES: Readonly<Record<TemplateId, readonly string[]>> = {
  T_CALL_BUYER: ["buyerName", "probability", "reason"],
  T_CALL_OWNER: ["propertyCode", "reason"],
  T_ADD_IMAGE: ["propertyCode", "delta"],
  T_PRICE_CUT: ["propertyCode", "percent", "scenario"],
  T_REPOST: ["propertyCode"],
  T_MATCH_INFORM: ["buyerName", "pathCount"],
  T_FOLLOWUP: ["buyerName", "daysAgo"],
  T_ARCHIVE_NOTE: ["itemId"],
  E_ATTENTION_TOP: ["propertyCode", "score", "reason"],
  E_CAUSAL_DO: ["action", "delta", "n"],
  E_COUNTERFACTUAL: ["action", "change"],
  E_SIMULATION_BEST: ["best"],
  E_MEMORY_SEEN: ["count", "lastAt"],
  E_GRAPH_PATH: ["from", "via", "to", "weight"],
  E_MARKET_TREND: ["area", "horizon", "trend"],
  E_DATA_MISSING: [],
  L_TTL_EXPIRED: [],
  L_COOLDOWN_ACTIVE: ["category", "hours"],
  L_RATE_LIMIT: [],
  L_REQUIRES_APPROVAL: [],
  L_NO_SPAM: [],
  L_UPDATED_SINCE: [],
  L_RISK_HIGH: ["reason"],
  L_ASLEEP: [],
};

/**
 * جای‌گذاری متغیرها در قالب — fail-loud:
 *   · قالب ناشناخته ⇒ خطا
 *   · متغیر گم‌شده ⇒ خطا (نه سکوت — روایت ناقص خطرناک‌تر از نبود روایت است)
 *   · متغیر اضافی ⇒ نادیده (آزادی فراخواننده)
 */
export function narrate(templateId: TemplateId, vars: Record<string, string | number>): string {
  const body = TEMPLATES[templateId];
  if (!body) throw new Error(`[decision-templates] قالب ناشناخته: ${templateId}`);
  const required = TEMPLATE_VARIABLES[templateId];
  for (const key of required) {
    if (!(key in vars) || vars[key] === undefined || vars[key] === null) {
      throw new Error(`[decision-templates] متغیر «${key}» برای قالب ${templateId} گم شده`);
    }
  }
  return body.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}

/** شمار جملات یک روایت — برای تست قاعدهٔ ۳-۵ جمله */
export function sentenceCount(narrative: string): number {
  return narrative.split(/[.!؟?؛;]/).map((s) => s.trim()).filter((s) => s.length > 0).length;
}
