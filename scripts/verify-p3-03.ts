/**
 * P3-03 — اسکریپت راستی‌آزمایی «قبل/بعد» مهاجرت RequestAgent به BaseIntelligentAgent
 * ------------------------------------------------------
 * سه پیکربندی روی همان پایگاه ایزوله (با ریست کامل کاشی «requests» پیش از هر پیکربندی):
 *   A) LegacyRequestAgent — extends BaseLearningAgent (کپی عیناً از کد پیش از مهاجرت)
 *   B) RequestAgent جدید — extends BaseIntelligentAgent بدون موتور (fallback کامل)
 *   C) RequestAgent جدید — با ۱۱ موتور stub تزریق‌شده (اثبات بی‌اثری تزریق بر خروجی)
 *
 * خروجی renderInsights (همه فیلدها) + learningStats باید در هر سه پیکربندی
 * «بایت‌به‌بایت» یکسان باشد.
 *
 * گارد صحت خودک: متن computeRawInsights کلاس Legacy در زمان اجرا با
 * git show pre-phase3-baseline:src/core/agent/request-agent.ts مقایسه می‌شود —
 * اگر کپی منحرف شده باشد، اسکریپت با خطای صریح متوقف می‌شود.
 *
 * ⚠️ طبق E.3 روی پایگاه ایزوله db/test-repository.db اجرا شود:
 *   DATABASE_URL=file:/home/z/my-project/db/test-repository.db MELK_TOKEN_KEY=test bun scripts/verify-p3-03.ts
 * داده p303- در پایان پاک می‌شود (اسکریپت خود-تمیزشونده).
 */

import { readFileSync } from "node:fs";
import { BaseLearningAgent } from "../src/core/agent/base-agent";
import type { InsightCard } from "../src/core/agent/base-agent";
import { getCustomerRepository, type CustomerRepository } from "../src/core/repositories";
import type { EngineDeps } from "../src/core/intelligence/engine-deps";
import { buildCustomerManagement, LIFECYCLE_FA } from "../src/lib/request/customer-mgmt";

// ===================== گارد صحت: کپی Legacy عیناً از baseline =====================

function extractMethod(source: string): string {
  const marker = "protected async computeRawInsights(): Promise<InsightCard[]> {";
  // lastIndexOf: نخستین رخداد ممکن است در رشتهٔ متنی خود همین گارد باشد — رخداد واقعی در کلاس است
  const start = source.lastIndexOf(marker);
  if (start < 0) throw new Error("نشانگر computeRawInsights یافت نشد");
  const endMarker = "return cards;\n  }";
  const end = source.indexOf(endMarker, start);
  if (end < 0) throw new Error("پایان computeRawInsights (return cards) یافت نشد");
  return source.slice(start, end + endMarker.length);
}

function verifyVerbatimCopy(): void {
  const proc = Bun.spawnSync(["git", "show", "pre-phase3-baseline:src/core/agent/request-agent.ts"], { cwd: "/home/z/my-project" });
  if (proc.exitCode !== 0) throw new Error("git show pre-phase3-baseline ناموفق بود");
  const baseline = new TextDecoder().decode(proc.stdout);
  const thisFile = readFileSync("/home/z/my-project/scripts/verify-p3-03.ts", "utf8");
  const baselineMethod = extractMethod(baseline);
  const legacyMethod = extractMethod(thisFile);
  if (baselineMethod !== legacyMethod) {
    throw new Error("کپی Legacy با baseline هم‌خوان نیست — computeRawInsights باید عیناً کپی شود");
  }
  console.log("✓ گارد صحت: بدنه computeRawInsights کلاس Legacy عیناً با baseline هم‌خوان است");
}

// ===================== کلاس Legacy — عیناً از کد پیش از مهاجرت =====================
// (فقط نام کلاس و مسیر importها تفاوت دارد؛ بدنه computeRawInsights بایت‌به‌بایت همان است)

class LegacyRequestAgent extends BaseLearningAgent {
  readonly tileId = "requests";
  readonly name = "ایجنت مدیریت مشتریان";
  readonly insightDomains = [
    "COMMUNITY_MGMT", "CUST_HEALTH", "LIFECYCLE_MGMT", "NEXT_ACTION", "MATCH", "CHURN", "EVENT_MGMT", "ARM_SYNC",
  ] as const;

  private readonly customers: CustomerRepository;

  constructor(deps?: { customers?: CustomerRepository }) {
    super();
    this.customers = deps?.customers ?? getCustomerRepository();
  }

  protected async computeRawInsights(): Promise<InsightCard[]> {
    const cards: InsightCard[] = [];
    const [requests, summary] = await Promise.all([
      this.customers.listRecentRequests(500).catch(() => []),
      buildCustomerManagement().catch(() => null),
    ]);

    const total = requests.length;
    const manual = requests.filter((r) => r.source === "manual").length;
    const auto = requests.filter((r) => r.source === "auto").length;
    const armRegistered = requests.filter((r) => Boolean(r.armRequestId)).length;

    // ===== دامنه COMMUNITY_MGMT — جامعه مشتریان =====
    if (!summary || summary.customers.length === 0) {
      cards.push({
        key: "community-empty",
        domain: "COMMUNITY_MGMT",
        title: "جامعه مشتریان در حال شکل‌گیری است",
        body:
          "نقش اصلی من «مدیریت مشتریان» است: به‌محض ثبت اولین درخواست (دستی برای مشتری حضوری، یا اتوماتیک با ثبت مستقیم در سامانه آرم)، برای هر مشتری پروفایل ۳۶۰ درجه می‌سازم — درخواست‌ها، رویدادها، آگهی‌هایی که مالکشان است، امتیاز سلامت، چرخه عمر و اقدام بعدی هوشمند. هر تعامل را با کلید «ثبت رویداد» مستند کنید تا حافظه من کامل شود.",
        severity: "info",
      });
    } else {
      const s = summary.stats;
      cards.push({
        key: "community-overview",
        domain: "COMMUNITY_MGMT",
        title: `جامعه مشتریان — ${s.totalCustomers} مشتری از ${total} درخواست`,
        body: `${manual} درخواست دستی (مشتری حضوری) و ${auto} درخواست اتوماتیک ثبت شده است. ${s.activeCustomers} مشتری فعال و ${s.dormantCustomers} مشتری راکد دارم؛ ${s.convertedCustomers} مشتری تا سطح معامله پیش رفته‌اند. میانگین امتیاز سلامت جامعه ${s.avgHealth}٪ است — قهرمانان بخش A (${s.segmentA} نفر) ارزش بیشترین زمان شما را دارند.`,
        severity: s.activeCustomers > 0 ? "positive" : "info",
        metrics: [
          { label: "مشتریان", value: String(s.totalCustomers) },
          { label: "فعال", value: String(s.activeCustomers) },
          { label: "راکد", value: String(s.dormantCustomers) },
          { label: "میانگین سلامت", value: `${s.avgHealth}٪` },
          { label: "بخش A", value: String(s.segmentA) },
          { label: "درخواست", value: String(total) },
        ],
      });
    }

    if (summary && summary.customers.length > 0) {
      const s = summary.stats;

      // ===== دامنه CUST_HEALTH — امتیاز سلامت =====
      const top = summary.customers.slice(0, 3);
      const weak = summary.customers.filter((c) => c.healthScore < 40);
      cards.push({
        key: "health-overview",
        domain: "CUST_HEALTH",
        title: `امتیاز سلامت مشتریان — میانگین ${s.avgHealth}٪`,
        body: `سلامت هر مشتری از ۵ مؤلفه ساخته می‌شود: تازگی تعامل (۳۵)، بسامد پیگیری (۲۵)، جدیت (۲۰)، آمادگی مالی (۱۰) و کامل‌بودن پرونده (۱۰). سلامت‌ترین مشتریان شما: ${top.map((c) => `«${c.name}» با ${c.healthScore}٪`).join("، ")}${weak.length > 0 ? `؛ ${weak.length} مشتری زیر ۴۰٪ دارند که نیاز به برنامه‌ریزی جدی دارند.` : "."}`,
        severity: s.avgHealth >= 60 ? "positive" : s.avgHealth >= 40 ? "info" : "warning",
        metrics: [
          { label: "میانگین", value: `${s.avgHealth}٪` },
          { label: "بخش A (۷۰+)", value: String(s.segmentA) },
          { label: "بخش B (۴۰-۶۹)", value: String(s.segmentB) },
          { label: "بخش C (<۴۰)", value: String(s.segmentC) },
        ],
      });

      // ===== دامنه LIFECYCLE_MGMT — چرخه عمر =====
      const sc = s.stageCounts;
      const dominant = (Object.entries(sc) as [keyof typeof sc, number][]).sort((a, b) => b[1] - a[1])[0];
      cards.push({
        key: "lifecycle",
        domain: "LIFECYCLE_MGMT",
        title: `چرخه عمر مشتریان — غالب: ${LIFECYCLE_FA[dominant[0]]} (${dominant[1]})`,
        body: `توزیع مراحل: ${Object.entries(sc).filter(([, n]) => n > 0).map(([k, n]) => `${LIFECYCLE_FA[k as keyof typeof LIFECYCLE_FA]} ${n}`).join("، ")}. مشتریان «آماده معامله» (${sc.READY_TO_DEAL}) با تطبیق قوی و جدیت بالا، نزدیک‌ترین افراد به درآمد شما هستند؛ «جدی»ها (${sc.SERIOUS}) با پیگیری منظم به این سطح می‌رسند و «راکد»ها (${sc.DORMANT}) نیاز به کمپین بازگشت دارند.`,
        severity: sc.READY_TO_DEAL > 0 ? "positive" : sc.DORMANT > s.totalCustomers / 3 ? "warning" : "info",
        metrics: [
          { label: "جدید", value: String(sc.NEW) },
          { label: "در تعامل", value: String(sc.ENGAGED) },
          { label: "جدی", value: String(sc.SERIOUS) },
          { label: "آماده معامله", value: String(sc.READY_TO_DEAL) },
          { label: "راکد", value: String(sc.DORMANT) },
        ],
      });

      // ===== دامنه NEXT_ACTION — اقدام بعدی (شاهکار) =====
      const urgent = summary.customers.flatMap((c) => c.nextActions.filter((a) => a.priority === 1).map((a) => ({ c, a })));
      cards.push({
        key: "next-action",
        domain: "NEXT_ACTION",
        title: urgent.length > 0 ? `${urgent.length} اقدام فوری در صف اقدام بعدی` : "اقدام بعدی — همه‌چیز در جریان است",
        body:
          urgent.length > 0
            ? `مهم‌ترین اقدام‌های امروز: ${urgent.slice(0, 3).map((x) => `«${x.c.name}»: ${x.a.title}`).join("؛ ")}. اقدام بعدی هر مشتری را از اولویت شرایطش استنتاج می‌کنم: بی‌تماسی، تطبیق موجود، ناقص‌بودن پرونده یا راکدشدن — و دقیقاً می‌گویم با کدام کلید (ثبت رویداد/ویرایش/ثبت در آرم) انجامش دهید.`
            : "هیچ اقدام فوری (اولویت ۱) در صف نیست — پیگیری نرم ادامه دارد و هر تماس/بازدید را با «ثبت رویداد» مستند کنید تا اولویت‌ها به‌روز بمانند.",
        severity: urgent.length > 0 ? "warning" : "positive",
        metrics: [
          { label: "اقدام فوری", value: String(urgent.length) },
          { label: "مشتریان با اقدام", value: String(summary.customers.filter((c) => c.nextActions.length > 0).length) },
        ],
      });

      // ===== دامنه MATCH — تطبیق درخواست↔آگهی (شاهکار) =====
      const allMatches = summary.customers.flatMap((c) => c.bestMatches);
      const strong = allMatches.filter((m) => m.score >= 70);
      cards.push({
        key: "match-engine",
        domain: "MATCH",
        title:
          allMatches.length === 0
            ? "موتور تطبیق درخواست↔آگهی آماده است"
            : `${allMatches.length} تطبیق فعال — ${strong.length} تطبیق قوی (۷۰٪+)`,
        body:
          allMatches.length === 0
            ? "موتور تطبیق من (عین «آگهی‌های پیشنهادی» سامانه آرم) هر درخواست را با آگهی‌های دفتر آگهی می‌سنجد: منطقه (۳۰)، نوع معامله (۲۰)، نوع ملک (۱۵)، بازه قیمت (۲۰) و بازه متراژ (۱۵). برای فعال‌شدن، درخواست‌ها را کامل کنید (بازه قیمت/متراژ مهم است) و آگهی‌های دفتر را ثبت نگه دارید."
            : `بهترین فرصت‌ها: ${strong.slice(0, 3).map((m) => `«${m.listingTitle}» با تطبیق ${m.score}٪ (${m.band})`).join("؛ ")}. هر تطبیق قوی + جدیت بالا = «آماده معامله» و پیشنهاد هماهنگی بازدید. تطبیق‌ها را در پنل «مدیریت مشتریان» با تفکیک کامل امتیاز ببینید.`,
        severity: strong.length > 0 ? "positive" : "info",
        metrics: [
          { label: "تطبیق فعال", value: String(allMatches.length) },
          { label: "قوی (۷۰+)", value: String(strong.length) },
          { label: "مشتریان با تطبیق", value: String(summary.customers.filter((c) => c.bestMatches.length > 0).length) },
        ],
      });

      // ===== دامنه CHURN — هشدار ریزش =====
      const overdue = summary.customers.filter((c) => (c.daysSinceInteraction ?? 999) > 14 && c.stage !== "CONVERTED");
      const highValue = overdue.filter((c) => c.healthScore >= 50 || c.segment === "A");
      cards.push({
        key: "churn-alert",
        domain: "CHURN",
        title: overdue.length > 0 ? `${overdue.length} مشتری بیش از ۱۴ روز بی‌تماس` : "هشدار ریزش — همه در تماس",
        body:
          overdue.length > 0
            ? `ریزش‌پذیرترین‌ها: ${overdue.slice(0, 3).map((c) => `«${c.name}» (${c.daysSinceInteraction} روز، سلامت ${c.healthScore}٪)`).join("، ")}${highValue.length > 0 ? ` — ${highValue.length} مورد از این‌ها ارزش بالا دارند و از دست دادنشان پرهزینه است.` : "."} برای هر مورد، امروز یک رویداد «تماس» ثبت کنید.`
            : "هیچ مشتری فعالی بیش از دو هفته بی‌تعامل نیست — ریتم پیگیری سالم است.",
        severity: overdue.length > 0 ? (highValue.length > 0 ? "critical" : "warning") : "positive",
        metrics: [
          { label: "بی‌تماس +۱۴ روز", value: String(overdue.length) },
          { label: "ارزش بالا", value: String(highValue.length) },
        ],
      });
    }

    // ===== دامنه EVENT_MGMT — رویدادها =====
    const events = await this.customers.listRecentEvents(500).catch(() => []);
    if (events.length > 0) {
      const weekAgo = Date.now() - 7 * 86400_000;
      const thisWeek = events.filter((e) => e.createdAt.getTime() >= weekAgo).length;
      const synced = events.filter((e) => Boolean(e.armEventId)).length;
      const typeCounts = new Map<string, number>();
      for (const e of events) typeCounts.set(e.eventTypeName, (typeCounts.get(e.eventTypeName) ?? 0) + 1);
      const topType = [...typeCounts.entries()].sort((a, b) => b[1] - a[1])[0];
      cards.push({
        key: "events-overview",
        domain: "EVENT_MGMT",
        title: `رویدادها — ${events.length} رویداد ثبت‌شده (${thisWeek} در هفتهٔ اخیر)`,
        body: `پرتکرارترین نوع: «${topType[0]}» با ${topType[1]} مورد. ${synced} رویداد با سامانه آرم همگام شده است. رویدادها حافظهٔ تعامل من هستند: امتیاز سلامت، چرخه عمر و اقدام بعدی هر مشتری مستقیماً از همین رویدادها تغذیه می‌شوند — هیچ تماس/بازدید/پیامی را بدون ثبت رویداد از دست ندهید.`,
        severity: thisWeek > 0 ? "positive" : "warning",
        metrics: [
          { label: "کل", value: String(events.length) },
          { label: "این هفته", value: String(thisWeek) },
          { label: "همگام آرم", value: String(synced) },
        ],
      });
    }

    // ===== دامنه ARM_SYNC — ثبت در سامانه آرم =====
    if (total > 0) {
      const failed = requests.filter((r) => {
        if (!r.armRegistrationJson) return false;
        try {
          return Boolean((JSON.parse(r.armRegistrationJson) as { failed?: boolean }).failed);
        } catch {
          return false;
        }
      }).length;
      const readyNotRegistered = requests.filter((r) => !r.armRequestId && r.status === "ready").length;
      cards.push({
        key: "arm-sync",
        domain: "ARM_SYNC",
        title: `ثبت در سامانه آرم — ${armRegistered} موفق${failed > 0 ? `، ${failed} ناموفق` : ""}${readyNotRegistered > 0 ? `، ${readyNotRegistered} آمادهٔ ثبت` : ""}`,
        body:
          failed > 0
            ? `${failed} ثبت با خطا روبه‌رو شده — گزارش گام‌به‌گام در دیالوگ «ثبت در سامانه ARM» موجود است؛ علت معمول، نبود توکن (ورود با کد پرسنلی + پیامک) یا قطعی موقت سامانه آرم است. ${readyNotRegistered > 0 ? `${readyNotRegistered} درخواست کامل در صف ثبت است.` : ""}`
            : `همهٔ ثبت‌ها موفق بوده‌اند. ${readyNotRegistered > 0 ? `${readyNotRegistered} درخواست کاملِ ثبت‌نشده در صف است — با کلید «ثبت در سامانه ARM»، ثبت گام‌به‌گام (جستجو/ایجاد مشتری ← شناسه‌ها ← ثبت نهایی عین کاربر عادی) انجام می‌شود.` : "درخواست تازه‌ای در صف ثبت نیست."}`,
        severity: failed > 0 ? "warning" : "positive",
        metrics: [
          { label: "ثبت‌شده در آرم", value: String(armRegistered) },
          { label: "ناموفق", value: String(failed) },
          { label: "آمادهٔ ثبت", value: String(readyNotRegistered) },
        ],
      });
    }

    return cards;
  }
}

// ===================== موتورهای stub (پیکربندی C) =====================

function makeStubEngines(): EngineDeps {
  return {
    context: {
      contractVersion: 1,
      async buildContext(q) {
        return { tileId: q.tileId, generatedAt: "2026-09-16T00:00:00.000Z", purpose: q.purpose };
      },
    },
    memory: {
      contractVersion: 1,
      async append() {},
      async query() {
        return [];
      },
    },
    retrieval: {
      contractVersion: 1,
      async retrieve() {
        return { snippets: [], hitCount: 0, method: "TF_COSINE" };
      },
    },
    feature: {
      contractVersion: 1,
      async compute(q) {
        return { tileId: q.tileId, domain: q.domain, computedAt: "2026-09-16T00:00:00.000Z", vector: {}, missing: [] };
      },
    },
    prediction: {
      contractVersion: 1,
      async predict(q) {
        return { id: "stub", tileId: q.tileId, target: q.target, predictedValue: 0, unit: "unit", confidence: 0.5, horizonDays: 30, modelVersion: "stub", rationale: "stub", computedAt: "2026-09-16T00:00:00.000Z" };
      },
    },
    decision: {
      contractVersion: 1,
      async decide() {
        return { ranked: [], topKey: "", appliedRuleIds: [] };
      },
    },
    actionPlanner: {
      contractVersion: 1,
      async plan() {
        return { steps: [], createdAt: "2026-09-16T00:00:00.000Z" };
      },
    },
    outcome: {
      contractVersion: 1,
      async record() {},
      async query() {
        return [];
      },
      async linkage() {
        return { matched: 0, unmatched: 0 };
      },
    },
    evaluation: {
      contractVersion: 1,
      async evaluate(q) {
        return { tileId: q.tileId, windowDays: 30, sampleSize: 0, verdict: "INSUFFICIENT_DATA", computedAt: "2026-09-16T00:00:00.000Z" };
      },
    },
    learning: {
      contractVersion: 1,
      async learn() {
        return { updated: false, newVersion: null, rationale: "stub", signalBreakdown: { feedbackSignals: 0, outcomeSignals: 0 } };
      },
    },
    safety: {
      contractVersion: 1,
      async assess() {
        return { riskLevel: "LOW", requiredApproval: false, reason: "stub", ruleIds: [] };
      },
    },
  };
}

// ===================== کاشت قطعی داده p303 =====================

const ANCHOR = Date.now();
const at = (days: number) => new Date(ANCHOR - days * 86400_000);

const BUY = "61a0-p303-buy";
const APT = "61a0-p303-apartment";
const RES = "61a0-p303-residential";
const SER_VHIGH = "61a7536b0927675c45489a59"; // خیلی زیاد → ۲۰
const SER_HIGH = "61a753650927675c45489a4f"; // زیاد → ۱۵
const PAY_CASH = "61a39bf0f06329efdeacbbef"; // نقدی → ۱۰
const PAY_MIXED = "61b4adae67a91fbc73ec891a"; // ملک و نقد → ۷

async function seedP303() {
  const { db } = await import("../src/lib/db");

  // پاک‌سازی idempotent
  await db.requestEventRecord.deleteMany({ where: { requestId: { startsWith: "p303-req-" } } });
  await db.requestRecord.deleteMany({ where: { id: { startsWith: "p303-req-" } } });
  await db.listingRecord.deleteMany({ where: { id: { startsWith: "p303-ls-" } } });

  // ---------- آگهی‌های دفتر (برای موتور تطبیق) ----------
  await db.listingRecord.createMany({
    data: [
      {
        id: "p303-ls-0", source: "manual", customerName: "مالک آگهی صفر", customerMobile: "09142000000",
        areaId: "1", areaName: "لیل", tradeTypeId: BUY, tradeTypeName: "خرید",
        propertyTypeId: APT, propertyTypeName: "آپارتمان", buildingTypeId: RES,
        inputsJson: JSON.stringify({ "قیمت": 3000000000, "مساحت": 100 }),
        status: "active", actorCode: "300000", createdAt: at(40), updatedAt: at(40),
      },
      {
        id: "p303-ls-1", source: "divar", customerName: "مالک آگهی یک", customerMobile: "09142000001",
        areaId: "2", areaName: "ائل‌گلی", tradeTypeId: BUY, tradeTypeName: "خرید",
        propertyTypeId: APT, propertyTypeName: "آپارتمان", buildingTypeId: RES,
        inputsJson: JSON.stringify({ "قیمت": 2600000000, "مساحت": 88 }),
        status: "active", actorCode: "300000", createdAt: at(35), updatedAt: at(35),
      },
      {
        id: "p303-ls-2", source: "manual", customerName: "مالک آگهی دو", customerMobile: "09142000002",
        areaId: "5", areaName: "باغمیشه", tradeTypeId: "61a0-p303-rent", tradeTypeName: "رهن و اجاره",
        propertyTypeId: "61a0-p303-office", propertyTypeName: "دفتر اداری", buildingTypeId: "61a0-p303-commercial",
        inputsJson: JSON.stringify({ "قیمت": 700000000, "مساحت": 60 }),
        status: "active", actorCode: "300000", createdAt: at(30), updatedAt: at(30),
      },
      {
        id: "p303-ls-3", source: "manual", customerName: "مالک آگهی بایگانی", customerMobile: "09142000003",
        areaId: "1", areaName: "لیل", tradeTypeId: BUY, tradeTypeName: "خرید",
        propertyTypeId: APT, propertyTypeName: "آپارتمان", buildingTypeId: RES,
        inputsJson: JSON.stringify({ "قیمت": 2800000000, "مساحت": 95 }),
        status: "archived", actorCode: "300000", createdAt: at(60), updatedAt: at(50),
      },
    ],
  });

  // ---------- درخواست‌ها (۵ مشتری × ۷ درخواست) ----------
  // مشتری A — قهرمان: کامل + جدیت خیلی زیاد + تطبیق قوی + رویدادهای اخیر
  await db.requestRecord.createMany({
    data: [
      {
        id: "p303-req-a0", source: "manual", customerName: "علی محمدی", customerMobile: "09141000001",
        cityId: "1", areaIdsJson: JSON.stringify(["1", "2"]), areaNamesJson: JSON.stringify(["لیل", "ائل‌گلی"]),
        tradeTypeId: BUY, tradeTypeName: "خرید", buildingTypeId: RES, propertyTypeId: APT, propertyTypeName: "آپارتمان",
        inputsJson: JSON.stringify({ totalPrice_from: 2000000000, totalPrice_to: 4000000000, space_from: 80, space_to: 120 }),
        userPaymentMethod: PAY_CASH, userPaymentMethodName: "نقدی", userSeriousity: SER_VHIGH, userSeriousityName: "خیلی زیاد",
        status: "ready", armRequestId: "p303-arm-a0", armRegisteredAt: at(9),
        actorCode: "300000", createdAt: at(12.3), updatedAt: at(3.25),
      },
      {
        id: "p303-req-a1", source: "auto", customerName: "علی محمدی", customerMobile: "09141000001",
        cityId: "1", areaIdsJson: JSON.stringify(["1"]), areaNamesJson: JSON.stringify(["لیل"]),
        tradeTypeId: BUY, tradeTypeName: "خرید", buildingTypeId: RES, propertyTypeId: APT,
        inputsJson: JSON.stringify({ totalPrice_from: 2500000000, totalPrice_to: 3500000000, space_from: 85, space_to: 110 }),
        userPaymentMethod: PAY_MIXED, userPaymentMethodName: "ملک و نقد", userSeriousity: SER_HIGH, userSeriousityName: "زیاد",
        status: "ready", armRequestId: "p303-arm-a1", armRegisteredAt: at(8),
        actorCode: "300000", createdAt: at(11.1), updatedAt: at(4.6),
      },
    ],
  });

  // مشتری B — ناقص (گام ۴ ناقص): COMPLETE_REQUEST path
  await db.requestRecord.create({
    data: {
      id: "p303-req-b0", source: "manual", customerName: "حسن احمدی", customerMobile: "09141000002",
      cityId: "1", areaIdsJson: JSON.stringify(["2"]), areaNamesJson: JSON.stringify(["ائل‌گلی"]),
      tradeTypeId: BUY, tradeTypeName: "خرید", buildingTypeId: RES, propertyTypeId: APT,
      inputsJson: JSON.stringify({ totalPrice_from: 1500000000, totalPrice_to: 2500000000, space_from: 70, space_to: 95 }),
      status: "draft",
      actorCode: "300000", createdAt: at(10.5), updatedAt: at(10.4),
    },
  });

  // مشتری C — راکد (بدون رویداد، ۳۵ روز): DORMANT + CHURN
  await db.requestRecord.create({
    data: {
      id: "p303-req-c0", source: "auto", customerName: "رضا کریمی", customerMobile: "09141000003",
      cityId: "1", areaIdsJson: JSON.stringify(["5"]), areaNamesJson: JSON.stringify(["باغمیشه"]),
      tradeTypeId: BUY, tradeTypeName: "خرید", buildingTypeId: RES, propertyTypeId: APT,
      inputsJson: JSON.stringify({ totalPrice_from: 1000000000, totalPrice_to: 2000000000, space_from: 60, space_to: 90 }),
      userPaymentMethod: PAY_MIXED, userPaymentMethodName: "ملک و نقد", userSeriousity: SER_HIGH, userSeriousityName: "زیاد",
      status: "ready",
      actorCode: "300000", createdAt: at(35.2), updatedAt: at(35.1),
    },
  });

  // مشتری D — ثبت آرم ناموفق: ARM_SYNC failed path
  await db.requestRecord.create({
    data: {
      id: "p303-req-d0", source: "manual", customerName: "امیر موسوی", customerMobile: "09141000004",
      cityId: "1", areaIdsJson: JSON.stringify(["9"]), areaNamesJson: JSON.stringify(["سعیدآباد"]),
      tradeTypeId: BUY, tradeTypeName: "خرید", buildingTypeId: RES, propertyTypeId: APT,
      inputsJson: JSON.stringify({ totalPrice_from: 1800000000, totalPrice_to: 2800000000, space_from: 75, space_to: 100 }),
      userPaymentMethod: PAY_CASH, userPaymentMethodName: "نقدی", userSeriousity: SER_HIGH, userSeriousityName: "زیاد",
      status: "ready", armRegistrationJson: JSON.stringify({ failed: true, steps: [{ key: "search", title: "جستجوی مشتری", status: "fail", detail: "نبود توکن" }] }),
      actorCode: "300000", createdAt: at(6.8), updatedAt: at(5.6),
    },
  });

  // مشتری E — کامل و آماده اما ثبت‌نشده: readyNotRegistered path
  await db.requestRecord.create({
    data: {
      id: "p303-req-e0", source: "manual", customerName: "کامران صادقی", customerMobile: "09141000005",
      cityId: "1", areaIdsJson: JSON.stringify(["7"]), areaNamesJson: JSON.stringify(["زعفرانیه"]),
      tradeTypeId: BUY, tradeTypeName: "خرید", buildingTypeId: RES, propertyTypeId: APT,
      inputsJson: JSON.stringify({ totalPrice_from: 3000000000, totalPrice_to: 5000000000, space_from: 100, space_to: 140 }),
      userPaymentMethod: PAY_CASH, userPaymentMethodName: "نقدی", userSeriousity: SER_VHIGH, userSeriousityName: "خیلی زیاد",
      status: "ready",
      actorCode: "300000", createdAt: at(2.9), updatedAt: at(2.8),
    },
  });

  // مشتری تبدیل‌شده — نام تطبیقی با معامله موجود (چسبنده به داده واقعی پایگاه)
  const convertedTx = await db.transactionRecord.findFirst({ where: { requestCustomer: { not: null } }, select: { requestCustomer: true } });
  if (convertedTx?.requestCustomer) {
    await db.requestRecord.create({
      data: {
        id: "p303-req-f0", source: "auto", customerName: convertedTx.requestCustomer, customerMobile: "09141000006",
        cityId: "1", areaIdsJson: JSON.stringify(["1"]), areaNamesJson: JSON.stringify(["لیل"]),
        tradeTypeId: BUY, tradeTypeName: "خرید", buildingTypeId: RES, propertyTypeId: APT,
        inputsJson: JSON.stringify({ totalPrice_from: 2000000000, totalPrice_to: 3000000000, space_from: 80, space_to: 100 }),
        userPaymentMethod: PAY_CASH, userPaymentMethodName: "نقدی", userSeriousity: SER_VHIGH, userSeriousityName: "خیلی زیاد",
        status: "ready", armRequestId: "p303-arm-f0", armRegisteredAt: at(20),
        actorCode: "300000", createdAt: at(25.4), updatedAt: at(21.2),
      },
    });
  }

  // ---------- رویدادها (مشتری A: ۵ رویداد اخیر؛ B: ۱؛ D: ۳ قدیمی‌تر) ----------
  const events = [
    { id: "p303-ev-0", requestId: "p303-req-a0", eventTypeId: "61a0-call", eventTypeName: "تماس", createdAt: at(3.25), armEventId: "arm-ev-0" },
    { id: "p303-ev-1", requestId: "p303-req-a0", eventTypeId: "61a0-call", eventTypeName: "تماس", createdAt: at(5.1), armEventId: null },
    { id: "p303-ev-2", requestId: "p303-req-a0", eventTypeId: "61a0-visit", eventTypeName: "بازدید", createdAt: at(6.2), armEventId: "arm-ev-2" },
    { id: "p303-ev-3", requestId: "p303-req-a1", eventTypeId: "61a0-msg", eventTypeName: "پیام", createdAt: at(4.6), armEventId: null },
    { id: "p303-ev-4", requestId: "p303-req-a1", eventTypeId: "61a0-call", eventTypeName: "تماس", createdAt: at(7.3), armEventId: null },
    { id: "p303-ev-5", requestId: "p303-req-b0", eventTypeId: "61a0-call", eventTypeName: "تماس", createdAt: at(10.4), armEventId: null },
    { id: "p303-ev-6", requestId: "p303-req-d0", eventTypeId: "61a0-visit", eventTypeName: "بازدید", createdAt: at(5.6), armEventId: null },
    { id: "p303-ev-7", requestId: "p303-req-d0", eventTypeId: "61a0-call", eventTypeName: "تماس", createdAt: at(6.5), armEventId: null },
    { id: "p303-ev-8", requestId: "p303-req-d0", eventTypeId: "61a0-msg", eventTypeName: "پیام", createdAt: at(6.6), armEventId: null },
  ];
  await db.requestEventRecord.createMany({
    data: events.map((e) => ({ ...e, date: "1405/06/20", hour: "10:30", actorCode: "300000", armSyncJson: e.armEventId ? JSON.stringify({ ok: true }) : null })),
  });

  // ---------- بازخورد/حافظه قطعی کاشی requests (برای RAG) ----------
  await db.agentFeedback.createMany({
    data: [
      { tileId: "requests", insightKey: "p303-fb-0", insightTitle: "جامعه مشتریان", rating: 1, comment: "جامعه مشتریان مفید بود", context: JSON.stringify({ domain: "COMMUNITY_MGMT" }) },
      { tileId: "requests", insightKey: "p303-fb-1", insightTitle: "امتیاز سلامت مشتریان", rating: 1, comment: null, context: JSON.stringify({ domain: "CUST_HEALTH" }) },
      { tileId: "requests", insightKey: "p303-fb-2", insightTitle: "چرخه عمر مشتریان", rating: -1, comment: "چرخه عمر گنگ بود", context: JSON.stringify({ domain: "LIFECYCLE_MGMT" }) },
      { tileId: "requests", insightKey: "p303-fb-3", insightTitle: "اقدام بعدی", rating: 1, comment: null, context: JSON.stringify({ domain: "NEXT_ACTION" }) },
      { tileId: "requests", insightKey: "p303-fb-4", insightTitle: "موتور تطبیق درخواست", rating: 1, comment: "تطبیق عالی بود", context: JSON.stringify({ domain: "MATCH" }) },
      { tileId: "requests", insightKey: "p303-fb-5", insightTitle: "هشدار ریزش", rating: -1, comment: null, context: JSON.stringify({ domain: "CHURN" }) },
      { tileId: "requests", insightKey: "p303-fb-6", insightTitle: "رویدادها", rating: 1, comment: null, context: JSON.stringify({ domain: "EVENT_MGMT" }) },
    ],
  });
  await db.agentMemory.createMany({
    data: [
      { tileId: "requests", kind: "INTERACTION", payload: JSON.stringify({ at: at(1.2).toISOString(), note: "رندر قبلی جامعه مشتریان" }) },
      { tileId: "requests", kind: "INTERACTION", payload: JSON.stringify({ at: at(2.4).toISOString(), note: "رندر قبلی امتیاز سلامت" }) },
      { tileId: "requests", kind: "FEEDBACK", payload: JSON.stringify({ at: at(3.1).toISOString(), note: "بازخورد تطبیق" }) },
    ],
  });
}

// ===================== ریست قطعی کاشی requests پیش از هر پیکربندی =====================

async function resetRequestsTile() {
  const { db } = await import("../src/lib/db");
  await db.agentMemory.deleteMany({ where: { tileId: "requests" } });
  await db.agentFeedback.deleteMany({ where: { tileId: "requests" } });
  await db.agentPolicyVersion.deleteMany({ where: { tileId: "requests" } });
  // بازخورد/حافظه قطعی دوباره کاشته می‌شود — وضعیت آغازین هر سه پیکربندی یکسان
  await db.agentFeedback.createMany({
    data: [
      { tileId: "requests", insightKey: "p303-fb-0", insightTitle: "جامعه مشتریان", rating: 1, comment: "جامعه مشتریان مفید بود", context: JSON.stringify({ domain: "COMMUNITY_MGMT" }) },
      { tileId: "requests", insightKey: "p303-fb-1", insightTitle: "امتیاز سلامت مشتریان", rating: 1, comment: null, context: JSON.stringify({ domain: "CUST_HEALTH" }) },
      { tileId: "requests", insightKey: "p303-fb-2", insightTitle: "چرخه عمر مشتریان", rating: -1, comment: "چرخه عمر گنگ بود", context: JSON.stringify({ domain: "LIFECYCLE_MGMT" }) },
      { tileId: "requests", insightKey: "p303-fb-3", insightTitle: "اقدام بعدی", rating: 1, comment: null, context: JSON.stringify({ domain: "NEXT_ACTION" }) },
      { tileId: "requests", insightKey: "p303-fb-4", insightTitle: "موتور تطبیق درخواست", rating: 1, comment: "تطبیق عالی بود", context: JSON.stringify({ domain: "MATCH" }) },
      { tileId: "requests", insightKey: "p303-fb-5", insightTitle: "هشدار ریزش", rating: -1, comment: null, context: JSON.stringify({ domain: "CHURN" }) },
      { tileId: "requests", insightKey: "p303-fb-6", insightTitle: "رویدادها", rating: 1, comment: null, context: JSON.stringify({ domain: "EVENT_MGMT" }) },
    ],
  });
  await db.agentMemory.createMany({
    data: [
      { tileId: "requests", kind: "INTERACTION", payload: JSON.stringify({ at: at(1.2).toISOString(), note: "رندر قبلی جامعه مشتریان" }) },
      { tileId: "requests", kind: "INTERACTION", payload: JSON.stringify({ at: at(2.4).toISOString(), note: "رندر قبلی امتیاز سلامت" }) },
      { tileId: "requests", kind: "FEEDBACK", payload: JSON.stringify({ at: at(3.1).toISOString(), note: "بازخورد تطبیق" }) },
    ],
  });
}

// ===================== اجرای یک پیکربندی و دفع خروجی =====================

interface AgentLike {
  renderInsights(): Promise<{ insights: unknown[]; policyVersion: number; memoryHits: number }>;
  learningStats(): Promise<Record<string, unknown>>;
}

async function capture(agent: AgentLike): Promise<string> {
  const stats = await agent.learningStats(); // stats-first (عین الگوی P2-07)
  const rendered = await agent.renderInsights();
  return JSON.stringify({ stats, rendered }, null, 2);
}

// ===================== اصلی =====================

async function main() {
  verifyVerbatimCopy();

  const { db } = await import("../src/lib/db");
  await seedP303();

  const { RequestAgent } = await import("../src/core/agent/request-agent");

  // --- پیکربندی A: Legacy (extends BaseLearningAgent) ---
  await resetRequestsTile();
  const outA = await capture(new LegacyRequestAgent());

  // --- پیکربندی B: جدید بدون موتور (fallback کامل) ---
  await resetRequestsTile();
  const outB = await capture(new RequestAgent());

  // --- پیکربندی C: جدید با ۱۱ موتور stub ---
  await resetRequestsTile();
  const outC = await capture(new RequestAgent({ engines: makeStubEngines() }));

  // --- مقایسه بایت‌به‌بایت ---
  let failures = 0;
  const cmp = (name: string, x: string, y: string) => {
    if (x === y) {
      console.log(`✓ ${name} — بایت‌به‌بایت یکسان (${x.length} نویسه)`);
    } else {
      failures += 1;
      console.error(`✗ ${name} — تفاوت! (A=${x.length}، طرف دیگر=${y.length})`);
      // نخستین نقطه تفاوت برای اشکال‌زدایی
      const n = Math.min(x.length, y.length);
      for (let i = 0; i < n; i++) {
        if (x[i] !== y[i]) {
          console.error(`  نخستین تفاوت در جای ${i}:\n  A: …${x.slice(Math.max(0, i - 60), i + 60)}…\n  ?: …${y.slice(Math.max(0, i - 60), i + 60)}…`);
          break;
        }
      }
      if (x.length !== y.length && x.slice(0, n) === y.slice(0, n)) {
        console.error(`  پیشوندها یکسانند؛ طول متفاوت است.`);
      }
    }
  };

  cmp("A (Legacy/BaseLearningAgent) ⇔ B (جدید/بدون موتور)", outA, outB);
  cmp("A (Legacy/BaseLearningAgent) ⇔ C (جدید/۱۱ موتور stub)", outA, outC);
  cmp("B (بدون موتور) ⇔ C (۱۱ موتور stub)", outB, outC);

  // خلاصه محتوایی برای گزارش
  const parsed = JSON.parse(outB) as { rendered: { insights: { key: string; domain: string }[]; policyVersion: number; memoryHits: number } };
  console.log(`\nبینش‌های پیکربندی B: ${parsed.rendered.insights.length} کارت — ${parsed.rendered.insights.map((i) => i.key).join("، ")}`);
  console.log(`نسخه سیاست: ${parsed.rendered.policyVersion} · خاطره‌های مؤثر: ${parsed.rendered.memoryHits}`);

  // --- پاک‌سازی خود-تمیزشونده ---
  await db.requestEventRecord.deleteMany({ where: { requestId: { startsWith: "p303-req-" } } });
  await db.requestRecord.deleteMany({ where: { id: { startsWith: "p303-req-" } } });
  await db.listingRecord.deleteMany({ where: { id: { startsWith: "p303-ls-" } } });
  await db.agentMemory.deleteMany({ where: { tileId: "requests" } });
  await db.agentFeedback.deleteMany({ where: { tileId: "requests" } });
  await db.agentPolicyVersion.deleteMany({ where: { tileId: "requests" } });
  console.log("پاک‌سازی p303 انجام شد.");

  await db.$disconnect();

  if (failures > 0) {
    console.error(`\nنتیجه: ${failures} مقایسه ناموفق — مهاجرت بایت‌به‌بایت نیست!`);
    process.exit(1);
  }
  console.log("\nنتیجه: هر سه پیکربندی بایت‌به‌بایت یکسان‌اند — مهاجرت P3-03 اثبات شد.");
}

main().catch((err) => {
  console.error("خطای verify-p3-03:", err);
  process.exit(1);
});
