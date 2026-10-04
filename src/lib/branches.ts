/**
 * رجیستری شعب ملک تبریز — P6530 / گام ۱ (دستور مالک ۱۴۰۵/۰۷/۹ — نکته ۲)
 * ---------------------------------------------------------------------------
 * ملک تبریز دارای چهار شعبه است (عین دستور مالک):
 *   ارتش · باغلارباغی · ملکی تبریزی · هتل مرمر
 *
 * ستون «شعبه» در فهرست‌های M1/M2/M4 = محل فعالیت کارشناس در شعب ملک تبریز.
 *
 * زنجیرهٔ تفکیک شعبه هر کارشناس (به‌ترتیب اعتبار):
 *   ۱) نقشهٔ دستی مالک — AppMeta کلید «expert-branch-map» (JSON: {نام کارشناس: شعبه})
 *      — قابل ویرایش توسط مالک بدون تغییر کد (شاهد: روت /api/crm/branches)
 *   ۲) دادهٔ سامانه‌های ARM/PM — businessId.title کارشناس اگر با نام یکی از شعب
 *      منطبق باشد (شاهد فعلی DB: «شعبه مرکزی» و «ملک تبریز» = نام شعبه نیستند)
 *   ۳) خروجی نهایی وقتی هیچ منبعی شعبه را نداده: «تعیین نشده» — نمایش صادقانه؛
 *      با اتصال تازهٔ ARM/PM و ارائهٔ دادهٔ شعبه در سامانه‌ها، خودکار پر می‌شود
 *
 * این ماژول صفر وابستگی به DB دارد (خالص — قابل تست)؛ خواندن نقشهٔ مالک در
 * لایهٔ روت انجام می‌شود و به‌عنوان override پاس داده می‌شود.
 */

/** چهار شعبهٔ ملک تبریز — عین نکته ۲ دستور مالک */
export const TABRIZ_BRANCHES: readonly string[] = ["ارتش", "باغلارباغی", "ملکی تبریزی", "هتل مرمر"] as const;

/** برچسب حالت «شعبه تعیین نشده» — نمایش صادقانه تا ارائهٔ داده توسط سامانه‌ها */
export const BRANCH_UNSET = "تعیین نشده";

/** نرمال‌سازی متن برای مقایسهٔ نام شعبه (نیم‌فاصله/فاصله + ارقام + ي/ك) */
export function normalizeBranchText(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .replace(/\u200c/g, " ")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[\u06F0-\u06F9\u0660-\u0669]/g, (d) =>
      String("۰۱۲۳۴۵۶۷۸۹".indexOf(d) >= 0 ? "۰۱۲۳۴۵۶۷۸۹".indexOf(d) : Number(d.charCodeAt(0) - 0x0660))
    )
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * آیا businessId.title سامانه‌های ARM/PM نام یکی از شعب ملک تبریز است؟
 * شاهد DB: مقدار فعلی همهٔ رکوردها «شعبه مرکزی» (ARM) یا «ملک تبریز» (PM) است —
 * اینها نام شعبه نیستند؛ اما اگر سامانه در آینده نام واقعی شعبه را ارائه کند،
 * همین‌جا شناسایی و استفاده می‌شود (صفر نگاشت اختراعی).
 */
export function matchTabrizBranch(businessTitle: string | null | undefined): string | null {
  const t = normalizeBranchText(businessTitle);
  if (!t) return null;
  for (const b of TABRIZ_BRANCHES) {
    if (normalizeBranchText(b) === t) return b;
  }
  return null;
}

/**
 * تفکیک شعبهٔ یک کارشناس — زنجیرهٔ کامل (خالص و قابل تست).
 * P6547/گام یک-۵ و گام چهارم-۱ — «اطلاعات ستون شعبه از سامانه pm استخراج گردد»:
 *   شعبهٔ PM (branchId.title از realtors/info/personnelInfo — کشف زندهٔ ۱۴۰۵/۰۷/۱۲)
 *   منبع اصلی شد و در صدر زنجیره نشست.
 * @param expertName نام کارشناس (کلید تطبیق پرسنل PM + نقشهٔ مالک)
 * @param pmBranchMap نقشهٔ نام→شعبه از رجیستری پرسنل PM (branchTitle — منبع اصلی)
 * @param ownerMap نقشهٔ دستی مالک (اختیاری — مکمل برای پرسنلِ فاقد شعبه در PM)
 * @param systemBusinessTitle businessId.title از ARM/PM (اختیاری)
 */
export function resolveExpertBranch(
  expertName: string | null | undefined,
  ownerMap?: Record<string, string> | null,
  systemBusinessTitle?: string | null,
  pmBranchMap?: Record<string, string> | null
): { branch: string; source: "pm" | "owner-map" | "system" | "unset" } {
  if (expertName) {
    // ۰) P6547 — سامانهٔ PM: منبع اصلی ستون شعبه (عین دستور مالک)
    if (pmBranchMap) {
      const direct = pmBranchMap[expertName];
      if (direct && TABRIZ_BRANCHES.includes(direct)) return { branch: direct, source: "pm" };
      const norm = normalizeBranchText(expertName);
      for (const [k, v] of Object.entries(pmBranchMap)) {
        if (normalizeBranchText(k) === norm && TABRIZ_BRANCHES.includes(v)) {
          return { branch: v, source: "pm" };
        }
      }
    }
    // ۱) نقشهٔ مالک — مکمل (پرسنلی که PM شعبه‌اش را نداده)
    if (ownerMap) {
      const direct = ownerMap[expertName];
      if (direct && TABRIZ_BRANCHES.includes(direct)) return { branch: direct, source: "owner-map" };
      // جست‌وجوی نرمال‌شده (ي/ك/نیم‌فاصله)
      const norm = normalizeBranchText(expertName);
      for (const [k, v] of Object.entries(ownerMap)) {
        if (normalizeBranchText(k) === norm && TABRIZ_BRANCHES.includes(v)) {
          return { branch: v, source: "owner-map" };
        }
      }
    }
  }
  // ۲) دادهٔ سامانه — فقط اگر واقعاً نام شعبه باشد
  const fromSystem = matchTabrizBranch(systemBusinessTitle);
  if (fromSystem) return { branch: fromSystem, source: "system" };
  // ۳) تعیین نشده
  return { branch: BRANCH_UNSET, source: "unset" };
}

/** اعتبارسنجی نقشهٔ مالک — مقادیر غیرمجاز حذف می‌شوند (گارد ورودی روت) */
export function sanitizeOwnerBranchMap(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof k === "string" && k.trim() !== "" && typeof v === "string" && TABRIZ_BRANCHES.includes(v)) {
      out[k.trim()] = v;
    }
  }
  return out;
}
