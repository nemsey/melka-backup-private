/**
 * تولید کلید توسعه — HOTFIX-01 (راه جایگزین پیش‌تعریف‌شده شورای راهبری)
 * ------------------------------------------------------
 * مشکل: حذف fallback باعث شکست بوت/ورود در محیط dev می‌شود.
 * راه‌حل: این اسکریپت یک کلید توسعه تصادفی می‌سازد و «فقط اگر وجود نداشته
 * باشد» به ‎.env.local اضافه می‌کند (هرگز بازنویسی نمی‌کند، هرگز commit نمی‌شود —
 * ‎.env* در .gitignore است). کلید توسعه با production متفاوت است.
 *
 * اجرا: bun scripts/dev-secrets.ts
 * خروجی: ساخت/تکمیل ‎.env.local با MELK_TOKEN_KEY (و در صورت خواست، MASTER_ACCESS_CODE)
 */

import { randomBytes } from "crypto";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const ENV_LOCAL = resolve(process.cwd(), ".env.local");

function readEnvLocal(): string {
  return existsSync(ENV_LOCAL) ? readFileSync(ENV_LOCAL, "utf8") : "";
}

function hasKey(content: string, key: string): boolean {
  return new RegExp(`^\\s*#?\\s*${key}\\s*=`, "m").test(content);
}

function main() {
  let content = readEnvLocal();
  const added: string[] = [];

  if (!hasKey(content, "MELK_TOKEN_KEY")) {
    const devKey = `dev-only-${randomBytes(24).toString("hex")}`;
    const line = `# تولیدشده توسط scripts/dev-secrets.ts — فقط محیط توسعه، هرگز production\nMELK_TOKEN_KEY=${devKey}\n`;
    content = content.trimEnd() + (content.trim() ? "\n\n" : "") + line;
    added.push("MELK_TOKEN_KEY (کلید تصادفی ۴۸ نویسه‌ای dev-only)");
  }

  if (!hasKey(content, "DATABASE_URL")) {
    const line = `DATABASE_URL=file:${resolve(process.cwd(), "db/custom.db")}\n`;
    content = content.trimEnd() + (content.trim() ? "\n\n" : "") + line;
    added.push("DATABASE_URL (پیش‌فرض dev)");
  }

  // MASTER_ACCESS_CODE عمداً ساخته نمی‌شود — کد واقعی مالک فقط вруч در محیط امن
  // تنظیم می‌شود (اگر تنظیم نشود، ورود مدیر در dev غیرفعال است؛ ورود OTP کار می‌کند).

  if (added.length === 0) {
    console.log("‎.env.local از قبل کامل است — چیزی اضافه نشد (سیاست عدم بازنویسی).");
  } else {
    writeFileSync(ENV_LOCAL, content, { encoding: "utf8" });
    console.log(`نوشته شد: ${ENV_LOCAL}`);
    for (const a of added) console.log(`  + ${a}`);
    console.log("\n⚠️  این فایل در git ثبت نمی‌شود (.gitignore: .env*) — کلید development است، نه production.");
    console.log("   برای production: MASTER_ACCESS_CODE و MELK_TOKEN_KEY واقعی را در متغیرهای محیطی سرور تنظیم کنید.");
  }
}

main();
