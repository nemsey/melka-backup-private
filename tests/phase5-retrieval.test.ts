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
