/**
 * delivery-failfast-proof.ts — اثبات D0: نبود fallback رازها (HOTFIX-01)
 * --------------------------------------------------------------------
 * سه سناریو:
 *   A) production بدون رازها → assertProductionSecrets باید throw کند (fail-fast)
 *   B) production با رازهای کامل → بدون خطا + masterCode معتبر ۸ رقمی
 *   C) master-login بدون MASTER_ACCESS_CODE → مسیر 503 (اثبات در hotfix01-secrets.test.ts)
 *
 * اجرا (از scripts/):
 *   سناریوی A: env -u MASTER_ACCESS_CODE -u MELK_TOKEN_KEY NODE_ENV=production bun scripts/delivery-failfast-proof.ts
 *   سناریوی B: NODE_ENV=production MASTER_ACCESS_CODE=... MELK_TOKEN_KEY=... bun scripts/delivery-failfast-proof.ts
 * خروجی: NEVER-FAIL-SILENTLY برای A (اگر throw نشد = exit 1)، OK برای B.
 */
import { assertProductionSecrets, getMelkApiConfig } from "../src/lib/melk-api/config";

const scenario = process.argv[2] ?? "auto";

function detect(): "A" | "B" {
  const hasAll =
    (process.env.MASTER_ACCESS_CODE ?? "").trim().length > 0 &&
    (process.env.MELK_TOKEN_KEY ?? "").trim().length > 0;
  return hasAll ? "B" : "A";
}

const sc = scenario === "auto" ? detect() : (scenario as "A" | "B");
console.log(`[failfast-proof] سناریو ${sc} — NODE_ENV=${process.env.NODE_ENV}`);
console.log(
  `[failfast-proof] وضعیت env فرایند: MASTER_ACCESS_CODE=${(process.env.MASTER_ACCESS_CODE ?? "").trim() ? "حاضر" : "غایب"} · MELK_TOKEN_KEY=${(process.env.MELK_TOKEN_KEY ?? "").trim() ? "حاضر" : "غایب"}`
);

if (sc === "A") {
  try {
    assertProductionSecrets();
    console.error("[failfast-proof] ✗ نقض HOTFIX-01: بدون رازها throw نشد!");
    process.exit(1);
  } catch (e: any) {
    const msg = String(e?.message ?? "");
    const mentionsSecrets = msg.includes("MASTER_ACCESS_CODE") && msg.includes("MELK_TOKEN_KEY");
    console.log(
      `[failfast-proof] ✓ fail-fast برقرار: ${mentionsSecrets ? "پیام هر دو راز غایب را نام می‌برد" : "throw شد"}`
    );
    console.log(`[failfast-proof]   پیام (بدون افشای راز): ${msg.slice(0, 120)}...`);
    process.exit(0);
  }
} else {
  assertProductionSecrets();
  const cfg = getMelkApiConfig();
  const codeOk = /^\d{8}$/.test(cfg.masterCode);
  const keyPresent = (process.env.MELK_TOKEN_KEY ?? "").trim().length >= 32;
  console.log(
    `[failfast-proof] ✓ بوت production با رازهای کامل: masterCode=${codeOk ? "۸رقم معتبر" : "نامعتبر!"} key=${keyPresent ? "≥۳۲ نویسه" : "کوتاه!"}`
  );
  process.exit(codeOk && keyPresent ? 0 : 1);
}
