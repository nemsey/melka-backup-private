/**
 * preload-guard.ts — محافظت پایگاه production از اجرای مستقیم تست (کشف P6.5-04)
 * ----------------------------------------------------------------------
 * مسئله: `bun test` فایل ‎.env‎ را بارگذاری می‌کند (ولی نه ‎.env.local‎ را)؛
 * DATABASE_URL پیش‌فرض آن به custom.db (production) اشاره می‌کند و اجرای برهنه
 * تست‌ها بدون تزریق env گارد (scripts/regression-guard.sh) روی production می‌نوشت.
 *
 * راه‌حل ریشه‌ای: این preload در هر اجرای تست، پیش از هر کدی فعال می‌شود
 * (bunfig.toml → [test].preload) و اگر DATABASE_URL به production اشاره کند
 * یا تنظیم نباشد، آن را به پایگاه تست ایزوله هدایت می‌کند.
 *
 * مسیر مجاز تست: db/test.db (پیش‌فرض گارد) — هرگز custom.db.
 * دور زدن عمدی ممنوع و بی‌معناست (تست هرگز نباید production را لمس کند).
 */
const url = process.env.DATABASE_URL ?? "";

if (url.includes("custom.db") || url.trim() === "") {
  if (url.includes("custom.db")) {
    // تنها نقطه هشدار — هرگز از داخل خود تست روی production نمی‌نویسیم
    process.stderr.write(
      "[preload-guard] DATABASE_URL به پایگاه production (custom.db) اشاره داشت — " +
        "تست‌ها به db/test.db هدایت شدند (محافظت production؛ استفاده: bash scripts/regression-guard.sh)\n"
    );
  }
  process.env.DATABASE_URL = "file:/home/z/my-project/db/test.db";
}

// راز تست: `bun test` ‎.env.local‎ را بارگذاری نمی‌کند (برخلاف bun run) — بدون این
// کلید، تست‌های رمزنگاری fail می‌شوند. مقدار فقط-تست عین تزریق گارد.
if (!process.env.MELK_TOKEN_KEY) {
  process.env.MELK_TOKEN_KEY = "test-only-key-not-a-real-secret";
}

// PN-013/D5 — شکست‌سریع شبکهٔ ARM در محیط تست:
// `bun run test` این مقدار را تزریق می‌کند، اما `bun test` برهنه نه؛ نتیجهٔ
// فقدانش (کشف زندهٔ کنترل انبار PN-013): تست ۶-ج (شبکه‌محور) ۳۰ ثانیه تا
// timeout صبر می‌کند و نوسان می‌سازد. اینجا همان قرارداد رسمی را تزریق می‌کنیم
// تا هر دو مسیر اجرای تست هم‌رفتار باشند: قطع شبکهٔ ARM ⇒ شکست سریع (~300ms).
if (!process.env.MELK_API_TIMEOUT_MS) {
  process.env.MELK_API_TIMEOUT_MS = "300";
}

// PN-029 (شورا-ن۰۳۳): حالت آفلینی ملک تبریز هرگز نباید در جلسهٔ تست فعال باشد —
// پرچم عملیاتیِ production است (env.platform.json). تستهای خودِ PN-029 آن را
// موقتاً و کنترل‌شده روشن/خاموش می‌کنند.
if (process.env.MELK_ARM_OFFLINE) {
  delete process.env.MELK_ARM_OFFLINE;
}
