import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const read = (p: string) => readFileSync(p, "utf8");

describe("PN-054 · استحکام نمای خصوصی — تلاش مجدد با ورود تازه (قانون «استخراج به هر شکل ممکن»)", () => {
  const src = read("src/lib/integrations/melketun/sync.ts");

  test("۴-۱) تلاش مجدد: نمای خصوصیِ خالی-با-خطا با ورود تازه دوباره واکشی می‌شود", () => {
    // شاهد رویداد واقعی سینک ۰۷:۲۷ — privateFilings=0 در اثر rate-limit گذرا
    expect(src).toContain("const fetchPriv = async (");
    expect(src).toContain("if (r.rows.length === 0 && errs.length > 0)");
    expect(src).toContain("const jar2 = await crmLogin(base, username, password, [])");
  });

  test("۴-۲) خنک‌سازی پیش از تلاش دوم (ادب در برابر rate-limit — ریسک #۴)", () => {
    expect(src).toContain("await sleep(2_500)");
  });

  test("۴-۳) خطاهای نمای خصوصی دیگر در آرایهٔ دورریز بلعیده نمی‌شوند (قانون ۱۴)", () => {
    expect(src).toContain("retriedViews: [");
    expect(src).toContain("privFilings.retried");
    // چهار نمای خصوصی/مخاطبین همگی از مسیر سخت‌شده می‌گذرند
    expect(src).toContain('const privFilings = await fetchPriv(');
    expect(src).toContain('const privPotentials = await fetchPriv(');
    expect(src).toContain('const contactsFilings = await fetchPriv(');
    expect(src).toContain('const contactsPotentials = await fetchPriv(');
  });

  test("۴-۴) رشته‌های کلیدی PN-051 (سازگاری تست‌های قبلی) دست‌نخورده‌اند", () => {
    expect(src).toContain("`/Melketunfilingplus${n > 1 ? `/${n}` : \"\"}`");
    expect(src).toContain("`/Potentials${n > 1 ? `/${n}` : \"\"}`");
    expect(src).toContain("`/contacts/filings${n > 1 ? `/${n}` : \"\"}`");
    expect(src).toContain("`/contacts/potentials${n > 1 ? `/${n}` : \"\"}`");
    expect(src).toContain("PRIVATE_VIEW_SKIPPED");
  });

  test("۴-۵) رفتار افزودنی حفظ شده — تلاش مجدد فقط در صورت «خطا»، نه نمای خالیِ مشروع", () => {
    // نمای خالی بدون خطا (= حساب واقعاً رکوردی ندارد) → بدون تلاش مجدد
    const m = src.match(/if \(r\.rows\.length === 0 && errs\.length > 0\)/);
    expect(m).not.toBeNull();
    expect(src).toContain("return { rows: r.rows, badPages: r.badPages, retried }");
  });
});
