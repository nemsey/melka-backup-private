/**
 * قرارداد موتور زمینه (ContextEngine) — PHASE 3 / interface خالص
 * ------------------------------------------------------
 * مسئولیت: تجمیع همه آنچه یک تصمیم باید «بداند»: کدام کاشی، چه زمانی،
 * چه کاربری، وضعیت داده امروز، پیکربندی فعال. تنها منبع حقیقت برای
 * «محیط اجرای تصمیم».
 *
 * مرز (قوانین اجرایی):
 *  - فقط خواندن؛ هرگز DB مستقیم (پیاده‌سازی آینده فقط از Repository تزریقی).
 *  - خروجی همیشه سریال‌پذیر (JSON-safe) تا در contextSnapshot بازخوردها ذخیره شود.
 *
 * نسخه قرارداد: 1 — رشد فقط افزودنی است (فیلد جدید = نسخه قرارداد بالاتر).
 * فاز پیاده‌سازی بدنه: PHASE 4.
 * در PHASE 3 فقط همین قرارداد است — هیچ پیاده‌سازی واقعی وجود ندارد.
 */

export type ContextPurpose = "insight-render" | "prediction" | "action" | "evaluation";

export interface ContextQuery {
  tileId: string;
  purpose: ContextPurpose;
  /** لحظه مرجع محاسبه زمینه — پیش‌فرض: زمان جاری */
  asOf?: Date;
}

export interface AgentContext {
  tileId: string;
  /** ISO 8601 — مهر زمان ساخت زمینه */
  generatedAt: string;
  purpose: ContextPurpose;
}

export interface ContextEngine {
  readonly contractVersion: 1;
  buildContext(query: ContextQuery): Promise<AgentContext>;
}
