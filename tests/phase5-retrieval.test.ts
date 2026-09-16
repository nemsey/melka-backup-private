/**
 * تست‌های PHASE 5 — موتور بازیابی ترکیبی (P5-02 تا P5-07)
 * ------------------------------------------------------
 * پوشش (سند طراحی PHASE-5-DESIGN بند ۵):
 *  ۱) MetadataFilter + queryWithFilter (P5-02) — پنج فیلتر روی هر دو فروشگاه
 *  ۲) BM25 KeywordSearch با نرمال‌سازی فارسی (P5-03)
 *  ۳) HybridRetriever با RRF (P5-04)
 *  ۴) Reranker heuristic (P5-05)
 *  ۵) Citation در ContextEngine (P5-06)
 *  ۶) اتصال افزودنی BaseIntelligentAgent (P5-07)
 *
 * صفر وابستگی DB — فروشگاه‌های در-حافظه/فایل مستقیم (الگوی PHASE 4).
 */

import { describe, expect, test, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { InMemoryStore, FileSystemStore, type MemoryRecord } from "@/core/intelligence/memory/memory-store";
import { embedText } from "@/core/intelligence/memory/vector-index";
import {
  resolveMetadata,
  normalizeForMatch,
  applyMetadataFilter,
} from "@/core/intelligence/retrieval/metadata";
import {
  KeywordSearch,
  tokenizeDual,
  normalizePersian,
} from "@/core/intelligence/retrieval/keyword-search";
import {
  HybridRetriever,
  createHybridRetriever,
} from "@/core/intelligence/retrieval/hybrid-retriever";
import type { MemoryStore } from "@/core/intelligence/memory/memory-store";

// ===================== دایرکتوری موقت تست فایل =====================

const TMP_ROOT = mkdtempSync(join(tmpdir(), "melk-p5-"));
afterAll(() => {
  rmSync(TMP_ROOT, { recursive: true, force: true });
});

// ===================== سازنده رکورد تستی =====================

let recSeq = 0;
function makeRecord(over: Partial<MemoryRecord> & { tileId: string }): MemoryRecord {
  recSeq += 1;
  const text = over.text ?? `متن آزمون ${recSeq}`;
  return {
    id: over.id ?? `p5rec-${recSeq}`,
    layer: over.layer ?? "AGENT",
    kind: over.kind ?? "NOTE",
    text,
    sentiment: over.sentiment ?? 0,
    createdAt: over.createdAt ?? new Date(Date.now() - recSeq * 3_600_000).toISOString(),
    embedding: over.embedding ?? embedText(text),
    metadata: over.metadata,
    tileId: over.tileId,
  };
}

/** لنگر زمانی قطعی تست‌ها — سه روز پیش */
const T0 = Date.now() - 3 * 86_400_000;
const iso = (daysFromT0: number) => new Date(T0 + daysFromT0 * 86_400_000).toISOString();

// ===================== P5-02: فیلتر متادیتا =====================

describe("P5-02 — MetadataFilter + queryWithFilter (پنج فیلد)", () => {
  test("فیلتر agentId — فقط رکوردهای همان ایجنت؛ رکورد قدیمی بدون agentId کنار می‌رود", async () => {
    const store = new InMemoryStore();
    const withAgent = makeRecord({
      tileId: "requests",
      text: "مشاهده ایجنت درخواست",
      metadata: { agentId: "requests-agent", source: "insight_generated" },
    });
    const otherAgent = makeRecord({
      tileId: "requests",
      text: "مشاهده ایجنت دیگر",
      metadata: { agentId: "file-finder-agent", source: "insight_generated" },
    });
    const legacy = makeRecord({ tileId: "requests", text: "رکورد قدیمی بدون متادیتا" });
    for (const r of [withAgent, otherAgent, legacy]) await store.save(r);

    const hits = await store.queryWithFilter!({ agentId: "requests-agent" });
    expect(hits.length).toBe(1);
    expect(hits[0].id).toBe(withAgent.id);

    // حل‌کننده: رکورد قدیمی → agentId نامشخص و source پیش‌فرض external
    expect(resolveMetadata(legacy).agentId).toBeUndefined();
    expect(resolveMetadata(legacy).source).toBe("external");
  });

  test("فیلتر tileId — منبع حقیقت بدنه رکورد است، نه متادیتای داخل آن", async () => {
    const store = new InMemoryStore();
    const a = makeRecord({ tileId: "requests", text: "حافظه کاشی درخواست" });
    // متادیتای ناسازگار عمدی — بدنه رکورد باید برنده باشد (قاعده منبع حقیقت)
    const b = makeRecord({ tileId: "file-finder", text: "حافظه کاشی فایل‌یابی", metadata: { tileId: "requests" } });
    await store.save(a);
    await store.save(b);

    const hits = await store.queryWithFilter!({ tileId: "requests" });
    expect(hits.length).toBe(1);
    expect(hits[0].id).toBe(a.id);
  });

  test("فیلتر area با نرمال‌سازی فارسی — «ائل‌گلی» (ZWNJ) ⇔ «ائلگلی» ⇔ «ائل گلی» و «ولیعصر» ⇔ «ولی عصر»", async () => {
    // نرمال‌سازی مقایسه: حذف ZWNJ و فاصله‌ها + یکسان‌سازی حروف/ارقام
    expect(normalizeForMatch("ائل\u200cگلی")).toBe(normalizeForMatch("ائلگلی"));
    expect(normalizeForMatch("ائل\u200cگلی")).toBe(normalizeForMatch("ائل گلی"));
    expect(normalizeForMatch("ولیعصر")).toBe(normalizeForMatch("ولی عصر"));

    const store = new InMemoryStore();
    const zwnj = makeRecord({
      tileId: "requests",
      text: "تقاضای خرید در ائل\u200cگلی",
      metadata: { area: "ائل\u200cگلی", city: "تبریز" },
    });
    const spaced = makeRecord({
      tileId: "requests",
      text: "تقاضای فروش در ولی عصر",
      metadata: { area: "ولی عصر" },
    });
    const other = makeRecord({ tileId: "requests", text: "تقاضای خرید در لیل", metadata: { area: "لیل" } });
    for (const r of [zwnj, spaced, other]) await store.save(r);

    const byPlain = await store.queryWithFilter!({ area: "ائلگلی" }); // بدون ZWNJ
    expect(byPlain.length).toBe(1);
    expect(byPlain[0].id).toBe(zwnj.id);

    const byJoined = await store.queryWithFilter!({ area: "ولیعصر" }); // چسبیده
    expect(byJoined.length).toBe(1);
    expect(byJoined[0].id).toBe(spaced.id);
  });

  test("فیلتر بازه زمانی — eventTime متادیتا ملاک است و رکورد قدیمی به createdAt برمی‌گردد", async () => {
    const store = new InMemoryStore();
    const early = makeRecord({
      tileId: "requests",
      text: "رویداد روز ۰",
      createdAt: iso(0),
      metadata: { eventTime: iso(0) },
    });
    const mid = makeRecord({
      tileId: "requests",
      text: "رویداد روز ۲",
      createdAt: iso(1), // ثبت فنی دیرتر از رویداد منطقی — eventTime ملاک است
      metadata: { eventTime: iso(2) },
    });
    const legacy = makeRecord({ tileId: "requests", text: "رکورد قدیمی", createdAt: iso(3) });
    for (const r of [early, mid, legacy]) await store.save(r);

    const inRange = await store.queryWithFilter!({ fromDate: iso(1), toDate: iso(3.5) });
    expect(inRange.map((r) => r.id).sort()).toEqual([mid.id, legacy.id].sort());

    // ترتیب خروجی: جدیدترین‌اول بر اساس eventTime حل‌شده
    expect(inRange[0].id).toBe(legacy.id); // eventTime حل‌شده = iso(3) — جدیدترین

    const onlyFrom = await store.queryWithFilter!({ fromDate: iso(2.5) });
    expect(onlyFrom.length).toBe(1);
    expect(onlyFrom[0].id).toBe(legacy.id);
  });

  test("فیلتر minConfidence — پیش‌فرض ۰٫۵ برای رکورد قدیمی؛ مقدار خارج بازه بریده می‌شود + FileSystemStore هم پشتیبانی می‌کند", async () => {
    // clamp در حل‌کننده
    const resolved = resolveMetadata({ tileId: "t", createdAt: iso(0), metadata: { confidence: 7 } });
    expect(resolved.confidence).toBe(1);

    const fileStore = new FileSystemStore(join(TMP_ROOT, "p502-filter.jsonl"));
    const strong = makeRecord({
      tileId: "requests",
      text: "اعتماد بالا",
      metadata: { confidence: 0.92, importance: 0.8 },
    });
    const weak = makeRecord({
      tileId: "requests",
      text: "اعتماد پایین",
      metadata: { confidence: 0.35 },
    });
    const legacy = makeRecord({ tileId: "requests", text: "اعتماد نامشخص" });
    for (const r of [strong, weak, legacy]) await fileStore.save(r);

    const hits = await fileStore.queryWithFilter!({ minConfidence: 0.6 });
    expect(hits.length).toBe(1);
    expect(hits[0].id).toBe(strong.id);

    // آستانه ۰٫۵ شامل پیش‌فرضِ رکورد قدیمی می‌شود (خنثی)
    const lenient = await fileStore.queryWithFilter!({ minConfidence: 0.5 });
    expect(lenient.map((r) => r.id).sort()).toEqual([strong.id, legacy.id].sort());

    // مسیر جایگزین محلی (بدون قابلیت queryWithFilter) همان نتیجه می‌دهد — duck-typing مصرف‌کننده
    const noCapStore: { query(q: {}): Promise<MemoryRecord[]> } = {
      async query() {
        return [strong, weak, legacy];
      },
    };
    const all = await noCapStore.query({});
    const local = applyMetadataFilter(all, { minConfidence: 0.6 });
    expect(local.length).toBe(1);
    expect(local[0].id).toBe(strong.id);
  });
});

// ===================== P5-03: BM25 کلیدواژه‌ای فارسی =====================

describe("P5-03 — BM25 KeywordSearch با نرمال‌سازی فارسی", () => {
  test("جستجوی «ولیعصر» هر دو سندِ حاوی «ولیعصر» و «ولی عصر» را پیدا می‌کند (تطبیق دو-شکل)", () => {
    const ks = new KeywordSearch();
    ks.index("joined", "قیمت آپارتمان در ولیعصر رشد کرد");
    ks.index("spaced", "قیمت آپارتمان در ولی عصر رشد کرد");
    ks.index("other", "قیمت آپارتمان در باغمیشه رشد کرد");

    const hits = ks.search("ولیعصر", 3);
    const ids = hits.map((h) => h.id);
    expect(ids).toContain("joined"); // تطبیق مستقیم primary
    expect(ids).toContain("spaced"); // تطبیق از طریق توکن مرکب سند
    expect(ids).not.toContain("other");

    // جهت معکوس: پرسش جدا، سند چسبیده
    const reverse = ks.search("ولی عصر", 3);
    const rids = reverse.map((h) => h.id);
    expect(rids).toContain("joined"); // پرسش مرکب‌سازی کرد → ولیعصر
    expect(rids).toContain("spaced"); // تطبیق مستقیم primary
  });

  test("ZWNJ «ائل‌گلی» درست توکنیزه می‌شود — با «ائلگلی» و «ائل گلی» هم‌جوین است", () => {
    // ZWNJ → فاصله در نرمال‌سازی؛ توکن مرکب شکل چسبیده را بازمی‌سازد
    expect(normalizePersian("ائل\u200cگلی")).toBe("ائل گلی");
    const dual = tokenizeDual("خرید خانه در ائل\u200cگلی تبریز");
    expect(dual.primary).toContain("ائل");
    expect(dual.primary).toContain("گلی");
    expect(dual.compound).toContain("ائلگلی");
    expect(dual.compound).toContain("خانهائل"); // جفت مجاورِ محتوایی
    expect(dual.compound).not.toContain("درائل"); // stopword قبل از ساخت مرکب حذف شده — زباله نمی‌سازد

    const ks = new KeywordSearch();
    ks.index("zwnj", "تقاضای خرید در ائل\u200cگلی بالاست");
    expect(ks.search("ائلگلی", 1).map((h) => h.id)).toEqual(["zwnj"]); // چسبیده → مرکب
    expect(ks.search("ائل گلی", 1).map((h) => h.id)).toEqual(["zwnj"]); // جدا → primary
    // ارقام فارسی/عربی هم‌ارز می‌شوند: «قیمت ۳» ⇔ «قیمت 3»
    const ks2 = new KeywordSearch();
    ks2.index("num", "قیمت ۳ میلیارد تومان");
    expect(ks2.search("قیمت 3", 1).map((h) => h.id)).toEqual(["num"]);
  });

  test("رتبه‌بندی — سند مرتبط‌تر بالاتر؛ topK رعایت می‌شود؛ ترتیب قطعی است", () => {
    const ks = new KeywordSearch();
    // دو سند هم‌طول (۵ توکن) — تنها تفاوت: فراوانی «خرید» → برتری صریح tf بدون ابهام طول
    ks.index("relevant", "خرید آپارتمان ولیعصر خرید خرید");
    ks.index("partial", "خرید آپارتمان باغمیشه قیمت رشد");
    ks.index("irrelevant", "اجاره ویلاElahi");
    ks.index("none", "هیچ موضوع مرتبطی نیست");

    const hits = ks.search("خرید آپارتمان", 2);
    expect(hits.length).toBe(2);
    expect(hits[0].id).toBe("relevant"); // tf بالاتر + کوتاه‌تر → امتیاز بیشتر
    expect(hits.map((h) => h.id)).toContain("partial");

    // تکرارپذیری — دو اجرا همان ترتیب
    const again = ks.search("خرید آپارتمان", 2);
    expect(again.map((h) => h.id)).toEqual(hits.map((h) => h.id));
    expect(again.map((h) => h.score)).toEqual(hits.map((h) => h.score));
  });

  test("stopword فارسی — حذف می‌شوند، پیشوندهای بر/می/نمی حفظ می‌شوند", () => {
    const dual = tokenizeDual("و در به از که این را با است بود برای تا یا تبریز");
    expect(dual.primary).toEqual(["تبریز"]); // فقط محتوایی مانده

    // بر/می/نمی stopword نیستند — به‌عنوان توکن مستقل/جزء مرکب حفظ می‌شوند
    const prefixes = tokenizeDual("برمی\u200cدارد می\u200cرود");
    expect(prefixes.primary).toContain("برمی");
    expect(prefixes.primary).toContain("دارد");
    expect(prefixes.primary).toContain("می");
    expect(prefixes.primary).toContain("رود");
    expect(prefixes.compound).toContain("برمیدارد");
    expect(prefixes.compound).toContain("میرود");

    // سندِ فقط-stopword هیچ‌وقت نتیجه نمی‌دهد
    const ks = new KeywordSearch();
    ks.index("empty", "و در به از که");
    expect(ks.search("در و به", 5)).toEqual([]);
    // پرسش فقط-stopword هم نتیجه‌ای ندارد
    ks.index("content", "گزارش بازار مسکن");
    expect(ks.search("و در به", 5)).toEqual([]);
  });

  test("بازه امتیاز معقول + remove/clear — امتیازها مثبت و کران‌دار؛ حذف سند اثر دارد", () => {
    const ks = new KeywordSearch();
    ks.index("a", "تحلیل بازار مسکن تبریز در ولیعصر");
    ks.index("b", "تحلیل معاملات آپارتمان");
    ks.index("c", "گزارش هفتگی بازار");
    const hits = ks.search("تحلیل بازار", 10);
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) {
      expect(Number.isFinite(h.score)).toBe(true);
      expect(h.score).toBeGreaterThan(0);
      expect(h.score).toBeLessThan(50); // کران معقول برای پیکره کوچک
    }
    // remove — سند از نتایج خارج می‌شود
    const target = hits[0].id;
    ks.remove(target);
    expect(ks.search("تحلیل بازار", 10).map((h) => h.id)).not.toContain(target);
    expect(ks.size).toBe(2);
    // حذف شناسه ناموجود بی‌خطاست
    expect(() => ks.remove("nope")).not.toThrow();
    // clear — خالی
    ks.clear();
    expect(ks.size).toBe(0);
    expect(ks.search("تحلیل", 5)).toEqual([]);
  });
});

// ===================== P5-04: بازیابی ترکیبی RRF =====================

describe("P5-04 — HybridRetriever با RRF", () => {
  const CORPUS = [
    "گزارش جامعه مشتریان درخواست ملک رشد کرد", // A — هر دو اصطلاح پرسش
    "جامعه مشتریان گزارش هفتگی", // B — هر دو اصطلاح، کوتاه‌تر
    "گزارش جامعه بازدیدها", // C — فقط «جامعه»
    "تحلیل بازار مسکن تبریز ولیعصر", // D — بی‌ارتباط
  ];

  /** فروشگاه پرشده با پیکره ثابت */
  async function corpusStore(): Promise<{ store: InMemoryStore; saved: MemoryRecord[] }> {
    const store = new InMemoryStore();
    const saved: MemoryRecord[] = [];
    for (const text of CORPUS) {
      const r = makeRecord({ tileId: "requests", text });
      saved.push(r);
      await store.save(r);
    }
    return { store, saved };
  }

  test("وزن بردار ۰ ⇔ خروجی عین KeywordSearch (شناسه‌ها و ترتیب)", async () => {
    const { store } = await corpusStore();
    const handle = await createHybridRetriever({ store });
    const out = await handle.retriever.retrieve({ text: "جامعه مشتریان" }, { topK: 4, weightVector: 0 });
    const kw = handle.keywordSearch.search("جامعه مشتریان", 4);
    expect(out.map((r) => r.record.id)).toEqual(kw.map((h) => h.id)); // همان شناسه‌ها و همان ترتیب
    expect(out.length).toBeGreaterThan(0);
    for (const item of out) {
      expect(item.sources).toEqual(["keyword"]); // هیچ سهم برداری
    }
  });

  test("وزن کلیدواژه ۰ ⇔ خروجی عین VectorSearch (شناسه‌ها و ترتیب)", async () => {
    const { store } = await corpusStore();
    const handle = await createHybridRetriever({ store });
    const out = await handle.retriever.retrieve({ text: "جامعه مشتریان" }, { topK: 4, weightKeyword: 0 });
    // جستجوی مستقیم روی همان نمایه با همان تعبیه — مرجع
    const vec = handle.vectorIndex.search(embedText("جامعه مشتریان"), 4);
    expect(out.map((r) => r.record.id)).toEqual(vec.map((h) => h.id));
    for (const item of out) {
      expect(item.sources).toEqual(["vector"]);
    }
  });

  test("تطبیق ترکیبی — سند دارای تطبیق کلمه‌ای و معنایی، هر دو منبع را دارد و بالا می‌ماند", async () => {
    const { store, saved } = await corpusStore();
    const handle = await createHybridRetriever({ store });
    const out = await handle.retriever.retrieve({ text: "جامعه مشتریان" }, { topK: 4 });

    // A و B — تطبیق کلیدواژه‌ای مستقیم + رتبه برداری بالا → منبع دوگانه و صدر
    const topTwo = new Set(out.slice(0, 2).map((r) => r.record.id));
    expect(topTwo.has(saved[0].id)).toBe(true);
    expect(topTwo.has(saved[1].id)).toBe(true);
    const topItem = out[0];
    expect(topItem.sources).toContain("vector");
    expect(topItem.sources).toContain("keyword");
    expect(topItem.vectorRank).not.toBeNull();
    expect(topItem.keywordRank).not.toBeNull();
    // امتیاز دوسورس > تک‌سورس (RRF — حضور در هر دو لیست جریمه ندارد، جمع دارد)
    const singleSource = out.find((r) => r.sources.length === 1);
    if (singleSource) expect(topItem.score).toBeGreaterThan(singleSource.score);
  });

  test("MetadataFilter روی نتایج اثر می‌گذارد + مسیر جایگزین بدون قابلیت queryWithFilter + sync پس از الحاق", async () => {
    const store = new InMemoryStore();
    const lil = makeRecord({
      tileId: "requests",
      text: "گزارش جامعه مشتریان منطقه لیل",
      metadata: { area: "لیل", city: "تبریز" },
    });
    const ilgoli = makeRecord({
      tileId: "requests",
      text: "گزارش جامعه مشتریان ائل\u200cگلی",
      metadata: { area: "ائل\u200cگلی" },
    });
    await store.save(lil);
    await store.save(ilgoli);

    // فروشگاه عمداً بدون قابلیت queryWithFilter — فقط پنج متد v1 (duck-typing مصرف‌کننده)
    const bare: MemoryStore = {
      save: (r) => store.save(r),
      findById: (id) => store.findById(id),
      query: (q) => store.query(q),
      deleteById: (id) => store.deleteById(id),
      clear: () => store.clear(),
    };
    const handle = await createHybridRetriever({ store: bare });

    const unfiltered = await handle.retriever.retrieve({ text: "جامعه مشتریان" }, { topK: 5 });
    expect(unfiltered.map((r) => r.record.id).sort()).toEqual([lil.id, ilgoli.id].sort());

    // فیلتر ناحیه — با نرمال‌سازی فارسی (ائل‌گلی ⇔ ائلگلی)
    const onlyLil = await handle.retriever.retrieve(
      { text: "جامعه مشتریان", filter: { area: "لیل" } },
      { topK: 5 },
    );
    expect(onlyLil.map((r) => r.record.id)).toEqual([lil.id]);

    const onlyIlgoli = await handle.retriever.retrieve(
      { text: "جامعه مشتریان", filter: { area: "ائلگلی" } },
      { topK: 5 },
    );
    expect(onlyIlgoli.map((r) => r.record.id)).toEqual([ilgoli.id]);

    // الحاق + sync — رکورد تازه بدون دوباره‌سازی دستی در دسترس می‌شود
    const fresh = makeRecord({ tileId: "requests", text: "جامعه مشتریان ولیعصر گزارش", metadata: { area: "ولیعصر" } });
    await bare.save(fresh);
    const beforeSync = await handle.retriever.retrieve({ text: "ولیعصر" }, { topK: 5 });
    expect(beforeSync.map((r) => r.record.id)).not.toContain(fresh.id); // نمایه قدیمی
    await handle.sync();
    const afterSync = await handle.retriever.retrieve({ text: "ولیعصر" }, { topK: 5 });
    expect(afterSync.map((r) => r.record.id)).toContain(fresh.id);
  });

  test("بی‌داده — فروشگاه خالی و topK صفر هر دو [] برمی‌گردانند", async () => {
    const empty = new InMemoryStore();
    const handle = await createHybridRetriever({ store: empty });
    expect(await handle.retriever.retrieve({ text: "هر چیزی" }, { topK: 5 })).toEqual([]);
    expect(handle.vectorIndex.size).toBe(0);
    expect(handle.keywordSearch.size).toBe(0);

    const store = new InMemoryStore();
    await store.save(makeRecord({ tileId: "requests", text: "گزارش جامعه مشتریان" }));
    const h2 = await createHybridRetriever({ store });
    expect(await h2.retriever.retrieve({ text: "جامعه" }, { topK: 0 })).toEqual([]);
  });
});
