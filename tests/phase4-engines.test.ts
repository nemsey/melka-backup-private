/**
 * تست‌های PHASE 4 — بدنه موتورهای Context و Memory (P4-02 تا P4-06)
 * ------------------------------------------------------
 * پوشش (سند طراحی PHASE-4-DESIGN بند ۵):
 *  ۱) VectorIndex و تعبیه قطعی (توکن‌سازی فارسی/ZWNJ، کسینوسی، topK، قطعیت)
 *  ۲) InMemoryStore (ذخیره/یافتن/فیلتر/ترتیب/حذف)
 *  ۳) FileSystemStore (ماندگاری بین نمونه‌ها، خط خراب، بازنویسی)
 *  ۴) MemoryEngineImpl (قرارداد v1 + retrieveSimilar/consolidate/stats/reindex)
 *  ۵) ContextEngineImpl (هم‌ارزی شکل buildContext با Placeholder + assemble/بودجه)
 *  ۶) اتصال BaseIntelligentAgent (observe/assembleContext + هم‌ارزی خروجی)
 *
 * صفر وابستگی DB — انبارهای والد با stub درون-حافظه‌ای (الگوی P3-03).
 */

import { describe, expect, test, afterAll } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { BaseIntelligentAgent, type BaseIntelligentAgentOptions } from "@/core/intelligence/base-intelligent-agent";
import { createDefaultEngineDeps, PassthroughContextEngine } from "@/core/intelligence/engine-deps";
import { InMemoryStore, FileSystemStore, type MemoryRecord } from "@/core/intelligence/memory/memory-store";
import { VectorIndex, embedText, tokenizeText, cosineSimilarity } from "@/core/intelligence/memory/vector-index";
import { MemoryEngineImpl, createMemoryEngine } from "@/core/intelligence/memory/memory-engine";
import { ContextEngineImpl, createContextEngine, CONTEXT_SEPARATOR } from "@/core/intelligence/context/context-engine";
import { BaseLearningAgent, type InsightCard } from "@/core/agent/base-agent";
import type { AgentMemoryRepository, PolicyRepository } from "@/core/repositories";
import type {
  AgentFeedbackDTO,
  AgentFeedbackInput,
  AgentMemoryDTO,
  AgentPolicyVersionDTO,
  PolicyVersionInput,
} from "@/core/repositories";

// ===================== دایرکتوری موقت تست فایل =====================

const TMP_ROOT = mkdtempSync(join(tmpdir(), "melk-p4-"));
afterAll(() => {
  rmSync(TMP_ROOT, { recursive: true, force: true });
});

// ===================== سازنده رکورد تستی =====================

let recSeq = 0;
function makeRecord(over: Partial<MemoryRecord> & { tileId: string }): MemoryRecord {
  recSeq += 1;
  return {
    id: over.id ?? `rec-${recSeq}`,
    layer: over.layer ?? "AGENT",
    kind: over.kind ?? "NOTE",
    text: over.text ?? `متن آزمون ${recSeq}`,
    sentiment: over.sentiment ?? 0,
    createdAt: over.createdAt ?? new Date(Date.now() - recSeq * 1000).toISOString(),
    embedding: over.embedding ?? embedText(over.text ?? `متن آزمون ${recSeq}`),
    metadata: over.metadata,
    tileId: over.tileId,
  };
}

// =====================================================================
// ۱) VectorIndex و تعبیه
// =====================================================================

describe("P4 — VectorIndex و تعبیه قطعی", () => {
  test("توکن‌سازی: ZWNJ و فاصله و نقطه‌گذاری جدا می‌کنند؛ ارقام فارسی→لاتین؛ حروف کوچک", () => {
    expect(tokenizeText("می‌شود Melk-Tabriz ۳ و 3")).toEqual(["می", "شود", "melk", "tabriz", "3", "و", "3"]);
    expect(tokenizeText("")).toEqual([]);
    expect(tokenizeText("...«تبریز»!!!")).toEqual(["تبریز"]);
  });

  test("embedText قطعی است و بُعد پیش‌فرض ۶۴ دارد", () => {
    const a = embedText("خرید آپارتمان در تبریز");
    const b = embedText("خرید آپارتمان در تبریز");
    expect(a).toEqual(b);
    expect(a.length).toBe(64);
  });

  test("embedText: بُعد سفارشی و متن خالی → بردار صفر", () => {
    expect(embedText("متن", 16).length).toBe(16);
    expect(embedText("")).toEqual(new Array(64).fill(0));
    expect(embedText("...!!!")).toEqual(new Array(64).fill(0));
  });

  test("کسینوسی: بردار یکسان → ۱؛ متعامد → ۰؛ مقابل → −۱", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 10);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 10);
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 10);
  });

  test("کسینوسی: بردار صفر → ۰ بدون NaN", () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
    expect(Number.isNaN(cosineSimilarity([0], [0]))).toBe(false);
  });

  test("VectorIndex: add/remove/size/clear", () => {
    const idx = new VectorIndex();
    expect(idx.size).toBe(0);
    idx.add("a", [1, 0]);
    idx.add("b", [0, 1]);
    expect(idx.size).toBe(2);
    idx.add("a", [1, 1]); // جایگزینی هم‌شناسه
    expect(idx.size).toBe(2);
    idx.remove("zzz"); // ناشناخته بی‌خطاست
    idx.remove("a");
    expect(idx.size).toBe(1);
    idx.clear();
    expect(idx.size).toBe(0);
  });

  test("VectorIndex: search نزولی + برش topK", () => {
    const idx = new VectorIndex();
    idx.add("same", [1, 0]);
    idx.add("orth", [0, 1]);
    idx.add("opp", [-1, 0]);
    idx.add("half", [1, 1]);
    const hits = idx.search([1, 0], 10);
    expect(hits[0]).toEqual({ id: "same", score: 1 });
    expect(hits.map((h) => h.id)).toEqual(["same", "half", "orth", "opp"]);
    expect(hits[1].score).toBeCloseTo(Math.SQRT1_2, 10);
    expect(idx.search([1, 0], 2).map((h) => h.id)).toEqual(["same", "half"]);
  });

  test("VectorIndex: تساوی امتیاز → ترتیب درج؛ topK=۰ → خالی", () => {
    const idx = new VectorIndex();
    idx.add("x1", [1, 0]);
    idx.add("x2", [1, 0]);
    idx.add("x3", [1, 0]);
    expect(idx.search([1, 0], 2).map((h) => h.id)).toEqual(["x1", "x2"]);
    expect(idx.search([1, 0], 0)).toEqual([]);
  });

  test("تعبیه تزریقی سفارشی در VectorIndex استفاده می‌شود", () => {
    const idx = new VectorIndex({ embed: () => [1, 0] });
    idx.add("m", [1, 0]);
    expect(idx.embedder("هر متنی")).toEqual([1, 0]);
    expect(idx.search([1, 0], 1)[0].id).toBe("m");
  });
});

// =====================================================================
// ۲) InMemoryStore
// =====================================================================

describe("P4 — InMemoryStore", () => {
  test("save و findById رفت‌وبرگشت؛ ناشناخته → null", async () => {
    const store = new InMemoryStore();
    const rec = makeRecord({ tileId: "t1", text: "سلام" });
    await store.save(rec);
    expect(await store.findById(rec.id)).toEqual(rec);
    expect(await store.findById("nope")).toBeNull();
  });

  test("query: فیلتر tileId/layer/kinds", async () => {
    const store = new InMemoryStore();
    await store.save(makeRecord({ tileId: "t1", layer: "EPISODIC", kind: "A" }));
    await store.save(makeRecord({ tileId: "t1", layer: "SEMANTIC", kind: "B" }));
    await store.save(makeRecord({ tileId: "t2", layer: "EPISODIC", kind: "A" }));
    expect((await store.query({ tileId: "t1" })).length).toBe(2);
    expect((await store.query({ tileId: "t1", layer: "EPISODIC" })).length).toBe(1);
    expect((await store.query({ tileId: "t1", kinds: ["B"] })).length).toBe(1);
    expect((await store.query({ tileId: "t1", kinds: [] })).length).toBe(2);
  });

  test("query: since + take + جدیدترین‌اول", async () => {
    const store = new InMemoryStore();
    await store.save(makeRecord({ tileId: "t", createdAt: "2026-09-10T00:00:00.000Z" }));
    await store.save(makeRecord({ tileId: "t", createdAt: "2026-09-14T00:00:00.000Z" }));
    await store.save(makeRecord({ tileId: "t", createdAt: "2026-09-12T00:00:00.000Z" }));
    const all = await store.query({ tileId: "t" });
    expect(all.map((r) => r.createdAt)).toEqual([
      "2026-09-14T00:00:00.000Z",
      "2026-09-12T00:00:00.000Z",
      "2026-09-10T00:00:00.000Z",
    ]);
    expect((await store.query({ tileId: "t", take: 2 })).length).toBe(2);
    expect((await store.query({ tileId: "t", since: "2026-09-11T00:00:00.000Z" })).length).toBe(2);
  });

  test("deleteById و clear", async () => {
    const store = new InMemoryStore();
    const a = makeRecord({ tileId: "t" });
    const b = makeRecord({ tileId: "t" });
    await store.save(a);
    await store.save(b);
    await store.deleteById(a.id);
    expect((await store.query({ tileId: "t" })).map((r) => r.id)).toEqual([b.id]);
    await store.clear();
    expect((await store.query({})).length).toBe(0);
  });
});

// =====================================================================
// ۳) FileSystemStore
// =====================================================================

describe("P4 — FileSystemStore", () => {
  test("ماندگاری بین دو نمونه (بارگذاری تنبل)", async () => {
    const path = join(TMP_ROOT, "persist", "memory.jsonl");
    const s1 = new FileSystemStore(path);
    const rec = makeRecord({ tileId: "fs", text: "ماندگاری" });
    await s1.save(rec);
    await s1.save(makeRecord({ tileId: "fs2", text: "دومی" }));
    const s2 = new FileSystemStore(path);
    expect(await s2.findById(rec.id)).toEqual(rec);
    expect((await s2.query({ tileId: "fs2" })).length).toBe(1);
  });

  test("فیلترها پس از reload؛ خط خراب نادیده گرفته می‌شود", async () => {
    const dir = join(TMP_ROOT, "corrupt");
    mkdirSync(dir, { recursive: true });
    const path = join(dir, "memory.jsonl");
    const good1 = makeRecord({ tileId: "c1", createdAt: "2026-09-10T00:00:00.000Z" });
    const good2 = makeRecord({ tileId: "c1", createdAt: "2026-09-15T00:00:00.000Z" });
    writeFileSync(path, `${JSON.stringify(good1)}\nاین خط خراب است\n${JSON.stringify(good2)}\n`, "utf8");
    const store = new FileSystemStore(path);
    const rows = await store.query({ tileId: "c1" });
    expect(rows.length).toBe(2);
    expect(rows[0].id).toBe(good2.id); // جدیدترین‌اول
    expect(rows.map((r) => r.id)).toContain(good1.id);
    expect((await store.query({ tileId: "c1", since: "2026-09-11T00:00:00.000Z" })).length).toBe(1);
  });

  test("deleteById و clear فایل را بازنویسی می‌کنند", async () => {
    const path = join(TMP_ROOT, "rewrite", "memory.jsonl");
    const store = new FileSystemStore(path);
    const a = makeRecord({ tileId: "r" });
    const b = makeRecord({ tileId: "r" });
    await store.save(a);
    await store.save(b);
    await store.deleteById(a.id);
    const afterDelete = new FileSystemStore(path);
    expect((await afterDelete.query({ tileId: "r" })).map((x) => x.id)).toEqual([b.id]);
    await store.clear();
    const afterClear = new FileSystemStore(path);
    expect((await afterClear.query({})).length).toBe(0);
  });
});

// =====================================================================
// ۴) MemoryEngineImpl
// =====================================================================

describe("P4 — MemoryEngineImpl (قرارداد v1)", () => {
  test("append: استخراج text از payload + قطع sentiment به علامت + id/createdAt", async () => {
    const engine = new MemoryEngineImpl();
    await engine.append({
      tileId: "t",
      layer: "EPISODIC",
      kind: "OBS",
      payload: { text: "مشتری تماس گرفت", sentiment: 5 },
    });
    await engine.append({ tileId: "t", layer: "EPISODIC", kind: "OBS", payload: { text: "بدون پاسخ", sentiment: -0.5 } });
    await engine.append({ tileId: "t", layer: "EPISODIC", kind: "OBS", payload: { متن: "خنثی" } });
    const rows = await engine.query({ tileId: "t" });
    expect(rows.length).toBe(3);
    // سه درج در یک میلی‌ثانیه ممکن است → ترتیب را با جست‌وجوی متن می‌سنجمیم نه ایندکس
    const byText = new Map(rows.map((r) => [r.text, r]));
    expect(byText.get("مشتری تماس گرفت")!.sentiment).toBe(1);
    expect(byText.get("بدون پاسخ")!.sentiment).toBe(-1);
    expect(rows.find((r) => r.text.includes("خنثی"))!.sentiment).toBe(0);
    expect(rows.find((r) => r.text.includes("خنثی"))!.text).toContain("خنثی"); // سریال‌سازی پایدار کل payload
    for (const r of rows) {
      expect(r.id).toBeTruthy();
      expect(Number.isNaN(Date.parse(r.createdAt))).toBe(false);
    }
  });

  test("query: دقیقاً هفت فیلد قراردادی + فیلترها + جدیدترین‌اول", async () => {
    const engine = new MemoryEngineImpl();
    const t0 = new Date("2026-09-10T00:00:00.000Z").getTime();
    let i = 0;
    for (const [layer, kind] of [["EPISODIC", "A"], ["SEMANTIC", "B"], ["EPISODIC", "B"]] as const) {
      i += 1;
      // createdAt توسط موتور تعیین می‌شود؛ برای قطعیت تست، ترتیب درج را می‌سنجیم
      await engine.append({ tileId: "q", layer, kind, payload: { text: `رکورد ${i}` } });
    }
    const rows = await engine.query({ tileId: "q", layer: "EPISODIC" });
    expect(rows.length).toBe(2);
    for (const r of rows) {
      expect(Object.keys(r).sort()).toEqual(["createdAt", "id", "kind", "layer", "sentiment", "text", "tileId"]);
    }
    expect((await engine.query({ tileId: "q", kinds: ["B"] })).length).toBe(2);
    expect((await engine.query({ tileId: "q", take: 1 })).length).toBe(1);
    expect((await engine.query({ tileId: "other" })).length).toBe(0);
    expect(t0).toBeGreaterThan(0); // مرجع زمانی معتبر
  });

  test("دو append مستقل → دو رکورد (خط‌مشی append-only؛ بدون به‌روزرسانی)", async () => {
    const engine = new MemoryEngineImpl();
    await engine.append({ tileId: "a", layer: "AGENT", kind: "K", payload: { text: "یک" } });
    await engine.append({ tileId: "a", layer: "AGENT", kind: "K", payload: { text: "دو" } });
    const rows = await engine.query({ tileId: "a" });
    expect(rows.length).toBe(2);
    expect(new Set(rows.map((r) => r.id)).size).toBe(2);
  });

  test("retrieveSimilar: رتبه‌بندی درست + جداسازی tileId + متن بی‌اشتراک → خالی", async () => {
    const engine = new MemoryEngineImpl();
    await engine.append({ tileId: "sim", layer: "EPISODIC", kind: "O", payload: { text: "خرید آپارتمان در لیل" } });
    await engine.append({ tileId: "sim", layer: "EPISODIC", kind: "O", payload: { text: "خرید آپارتمان در ائل‌گلی" } });
    await engine.append({ tileId: "sim", layer: "EPISODIC", kind: "O", payload: { text: "اجاره ویلا در وانیار" } });
    await engine.append({ tileId: "other", layer: "EPISODIC", kind: "O", payload: { text: "خرید آپارتمان در لیل" } });
    const hits = await engine.retrieveSimilar("sim", "خرید آپارتمان");
    expect(hits.length).toBe(2);
    // «در لیل» = ۴ توکن → ۲/√۸ ≈ 0.7071؛ «در ائل‌گلی» با ZWNJ = ۵ توکن → ۲/√۱۰ ≈ 0.6325
    expect(hits[0].score).toBeCloseTo(0.7071067811865476, 10);
    expect(hits[1].score).toBeCloseTo(0.6324555320336759, 10);
    expect(hits.map((h) => h.entry.text)).toEqual(["خرید آپارتمان در لیل", "خرید آپارتمان در ائل‌گلی"]);
    expect((await engine.retrieveSimilar("sim", "قرارداد حقوقی شرکت")).length).toBe(0);
    expect((await engine.retrieveSimilar("sim", "خرید آپارتمان", 1)).length).toBe(1);
    expect((await engine.retrieveSimilar("sim", "خرید آپارتمان", 0)).length).toBe(0);
  });

  test("consolidate: گروه مشابه → یک رکورد CONSOLIDATED با mergedIds؛ اصل‌ها می‌مانند", async () => {
    const engine = new MemoryEngineImpl();
    await engine.append({ tileId: "c", layer: "EPISODIC", kind: "OBS", payload: { text: "مشتری خرید آپارتمان لیل" } });
    await engine.append({ tileId: "c", layer: "EPISODIC", kind: "OBS", payload: { text: "خرید آپارتمان لیل مشتری" } });
    await engine.append({ tileId: "c", layer: "EPISODIC", kind: "OBS", payload: { text: "خرید آپارتمان در لیل مشتری جدید" } });
    await engine.append({ tileId: "c", layer: "EPISODIC", kind: "OBS", payload: { text: "اجاره ویلا وانیار" } });
    const before = (await engine.query({ tileId: "c" })).length;
    const report = await engine.consolidate("c", { threshold: 0.5 });
    expect(report.scanned).toBe(4);
    expect(report.groups.length).toBe(1);
    expect(report.groups[0].size).toBe(3);
    expect(report.groups[0].mergedIds.length).toBe(2);
    // اصل‌ها حذف نشده‌اند + یک رکورد ادغام‌شده اضافه شده است
    const after = await engine.query({ tileId: "c" });
    expect(after.length).toBe(before + 1);
    const consolidated = await engine.query({ tileId: "c", kinds: ["CONSOLIDATED"] });
    expect(consolidated.length).toBe(1);
    expect(consolidated[0].layer).toBe("SEMANTIC");
    expect(consolidated[0].text).toContain("ادغام 3 رکورد مشابه");
    // اجرای دوم بدون رکورد ادغام‌شده در داوطلبان، گروه جدید نمی‌سازد (زنجیره نمی‌کند)
    const report2 = await engine.consolidate("c", { threshold: 0.5 });
    expect(report2.groups.length).toBe(0);
  });

  test("stats و reindex روی FileSystemStore (همگام‌سازی پس از reload)", async () => {
    const path = join(TMP_ROOT, "engine", "memory.jsonl");
    const e1 = new MemoryEngineImpl({ store: new FileSystemStore(path) });
    await e1.append({ tileId: "s", layer: "EPISODIC", kind: "A", payload: { text: "خرید آپارتمان لیل" } });
    await e1.append({ tileId: "s", layer: "SEMANTIC", kind: "B", payload: { text: "اجاره ویلا وانیار" } });
    const s1 = await e1.stats();
    expect(s1.entries).toBe(2);
    expect(s1.byLayer.EPISODIC).toBe(1);
    expect(s1.byLayer.SEMANTIC).toBe(1);
    // نمونه دوم روی همان فایل: نمایه خالی → همگام‌سازی تنبل خودکار
    const e2 = new MemoryEngineImpl({ store: new FileSystemStore(path) });
    const hits = await e2.retrieveSimilar("s", "خرید آپارتمان");
    expect(hits.length).toBe(1);
    expect(hits[0].entry.text).toBe("خرید آپارتمان لیل");
    await e2.reindex(); // بازسازی صریح هم بی‌خطاست
    expect((await e2.retrieveSimilar("s", "اجاره")).length).toBe(1);
  });

  test("کارخانه createMemoryEngine هم‌ارز سازنده مستقیم", async () => {
    const engine = createMemoryEngine();
    await engine.append({ tileId: "f", layer: "GLOBAL", kind: "K", payload: { text: "کارخانه" } });
    expect((await engine.query({ tileId: "f" })).length).toBe(1);
    expect(engine.contractVersion).toBe(1);
  });
});

// =====================================================================
// ۵) ContextEngineImpl
// =====================================================================

describe("P4 — ContextEngineImpl (قرارداد v1 + assemble)", () => {
  test("buildContext: دقیقاً سه فیلد قراردادی + قطعیت asOf (هم‌ارز Placeholder)", async () => {
    const engine = new ContextEngineImpl();
    const asOf = new Date("2026-09-16T08:30:00.000Z");
    const ctx = await engine.buildContext({ tileId: "requests", purpose: "insight-render", asOf });
    expect(Object.keys(ctx).sort()).toEqual(["generatedAt", "purpose", "tileId"]);
    expect(ctx).toEqual({
      tileId: "requests",
      generatedAt: "2026-09-16T08:30:00.000Z",
      purpose: "insight-render",
    });
    // هم‌ارزی شکل با Placeholder (تعویض موتور، شکل خروجی قراردادی را عوض نمی‌کند)
    const passthrough = await new PassthroughContextEngine().buildContext({
      tileId: "requests",
      purpose: "insight-render",
      asOf,
    });
    expect(ctx).toEqual(passthrough);
  });

  test("buildContext: بدون asOf → ISO معتبر", async () => {
    const ctx = await new ContextEngineImpl().buildContext({ tileId: "t", purpose: "action" });
    expect(Number.isNaN(Date.parse(ctx.generatedAt))).toBe(false);
    expect(ctx.purpose).toBe("action");
  });

  test("assemble: حافظه مرتبط (ترتیب شباهت) + سیگنال‌ها + جداکننده استاندارد", async () => {
    const memory = new MemoryEngineImpl();
    await memory.append({ tileId: "requests", layer: "EPISODIC", kind: "OBS", payload: { text: "خرید آپارتمان در لیل" } });
    await memory.append({ tileId: "requests", layer: "EPISODIC", kind: "OBS", payload: { text: "اجاره ویلا وانیار" } });
    const engine = new ContextEngineImpl({ memory });
    const wc = await engine.assemble(
      { tileId: "requests", purpose: "prediction" },
      { text: "خرید آپارتمان", signals: ["امروز: ۳ درخواست جدید"] },
    );
    expect(wc.memories.length).toBe(1);
    expect(wc.memories[0].text).toBe("خرید آپارتمان در لیل");
    expect(wc.signals).toEqual(["امروز: ۳ درخواست جدید"]);
    expect(wc.contextText).toBe(`خرید آپارتمان در لیل${CONTEXT_SEPARATOR}امروز: ۳ درخواست جدید`);
    expect(wc.base.tileId).toBe("requests");
    expect(wc.base.purpose).toBe("prediction");
    expect(wc.truncated).toBe(false);
    expect(wc.tokenEstimate).toBe(Math.ceil(wc.contextText.length / 4));
    expect(wc.budgetTokens).toBe(2048);
  });

  test("assemble: بودجه توکن — برش + پرچم truncated", async () => {
    const engine = new ContextEngineImpl({ maxContextTokens: 10, charsPerToken: 4 });
    const wc = await engine.assemble(
      { tileId: "t", purpose: "evaluation" },
      { signals: ["a".repeat(30), "b".repeat(30)] },
    );
    expect(wc.truncated).toBe(true);
    expect(wc.contextText.length).toBe(40); // 10×4
    expect(wc.contextText).toBe("a".repeat(30) + CONTEXT_SEPARATOR + "b".repeat(5));
    expect(wc.tokenEstimate).toBe(10);
  });

  test("assemble: بدون منبع حافظه → فقط سیگنال‌ها؛ topK رعایت می‌شود", async () => {
    const memory = new MemoryEngineImpl();
    for (let i = 0; i < 6; i++) {
      await memory.append({ tileId: "t", layer: "EPISODIC", kind: "O", payload: { text: `خرید آپارتمان شماره ${i}` } });
    }
    const noMem = await new ContextEngineImpl().assemble({ tileId: "t", purpose: "insight-render" }, { signals: ["s"] });
    expect(noMem.memories).toEqual([]);
    expect(noMem.contextText).toBe("s");
    const withMem = await new ContextEngineImpl({ memory, maxMemories: 3 }).assemble(
      { tileId: "t", purpose: "insight-render" },
      { text: "خرید آپارتمان" },
    );
    expect(withMem.memories.length).toBe(3);
    const withTopK = await new ContextEngineImpl({ memory }).assemble(
      { tileId: "t", purpose: "insight-render" },
      { text: "خرید آپارتمان", topK: 2 },
    );
    expect(withTopK.memories.length).toBe(2);
  });

  test("کارخانه createContextEngine هم‌ارز سازنده مستقیم", async () => {
    const engine = createContextEngine({ maxContextTokens: 5 });
    const wc = await engine.assemble({ tileId: "t", purpose: "action" }, { signals: ["abcdefghij"] });
    expect(engine.contractVersion).toBe(1);
    expect(wc.budgetTokens).toBe(5);
  });
});

// =====================================================================
// ۶) اتصال BaseIntelligentAgent
// =====================================================================

// ---------- انبارهای stub درون-حافظه‌ای (الگوی P3-03) ----------

let stubSeq = 0;
const stubNow = () => new Date("2026-09-16T08:00:00.000Z");

class StubMemoryRepo implements AgentMemoryRepository {
  readonly memories: AgentMemoryDTO[] = [];
  readonly feedbacks: AgentFeedbackDTO[] = [];

  async append(tileId: string, kind: string, payloadJson: string): Promise<void> {
    this.memories.push({ id: `m-${stubSeq++}`, tileId, kind, payload: payloadJson, createdAt: stubNow() });
  }
  async listRecent(tileId: string, take: number): Promise<AgentMemoryDTO[]> {
    return this.memories.filter((m) => m.tileId === tileId).slice(-take).reverse();
  }
  async listFeedbacks(tileId: string, take: number): Promise<AgentFeedbackDTO[]> {
    return this.feedbacks.filter((f) => f.tileId === tileId).slice(-take).reverse();
  }
  async listAllFeedbacks(tileId: string): Promise<AgentFeedbackDTO[]> {
    return this.feedbacks.filter((f) => f.tileId === tileId);
  }
  async createFeedback(input: AgentFeedbackInput): Promise<void> {
    this.feedbacks.push({ id: `f-${stubSeq++}`, createdAt: stubNow(), ...input });
  }
  async countMemory(tileId: string): Promise<number> {
    return this.memories.filter((m) => m.tileId === tileId).length;
  }
  async countFeedback(tileId: string, positiveOnly?: boolean): Promise<number> {
    return this.feedbacks.filter((f) => f.tileId === tileId && (!positiveOnly || f.rating === 1)).length;
  }
}

class StubPolicyRepo implements PolicyRepository {
  readonly versions: AgentPolicyVersionDTO[] = [];

  async findActive(tileId: string): Promise<AgentPolicyVersionDTO | null> {
    return this.versions.filter((v) => v.tileId === tileId && v.active)[0] ?? null;
  }
  async findLatest(tileId: string): Promise<AgentPolicyVersionDTO | null> {
    const rows = this.versions.filter((v) => v.tileId === tileId).sort((a, b) => b.version - a.version);
    return rows[0] ?? null;
  }
  async findByTileAndVersion(tileId: string, version: number): Promise<AgentPolicyVersionDTO | null> {
    return this.versions.find((v) => v.tileId === tileId && v.version === version) ?? null;
  }
  async listVersions(tileId: string): Promise<AgentPolicyVersionDTO[]> {
    return this.versions.filter((v) => v.tileId === tileId).sort((a, b) => b.version - a.version);
  }
  async createVersion(input: PolicyVersionInput): Promise<AgentPolicyVersionDTO> {
    const row: AgentPolicyVersionDTO = {
      id: `p-${stubSeq++}`,
      tileId: input.tileId,
      version: input.version,
      content: input.content,
      rationale: input.rationale,
      active: input.active,
      createdAt: stubNow(),
      activatedAt: input.activatedAt ?? null,
    };
    this.versions.push(row);
    return row;
  }
  async activateVersion(tileId: string, versionId: string, activatedAt: Date): Promise<void> {
    for (const v of this.versions) {
      if (v.tileId === tileId) v.active = v.id === versionId;
    }
    const target = this.versions.find((v) => v.id === versionId);
    if (target) target.activatedAt = activatedAt;
  }
  async countVersions(tileId: string): Promise<number> {
    return this.versions.filter((v) => v.tileId === tileId).length;
  }
}

// ---------- ایجنت شاهد (خروجی کاملاً قطعی) ----------

class EchoAgent extends BaseIntelligentAgent {
  readonly tileId = "echo";
  readonly name = "ایجنت شاهد";
  readonly insightDomains = ["ECHO"] as const;

  constructor(options?: BaseIntelligentAgentOptions) {
    super(options);
  }

  protected async computeRawInsights(): Promise<InsightCard[]> {
    return [
      { key: "echo-card", domain: "ECHO", title: "عنوان ثابت", body: "متن ثابت", severity: "info" },
      { key: "echo-card-2", domain: "ECHO", title: "عنوان ثابت دوم", body: "متن ثابت دوم", severity: "positive" },
    ];
  }

  /** در معرض قرار دادن متدهای protected برای تست سیم‌کشی PHASE 4 */
  async pubObserve(kind: string, payload: Record<string, unknown>, layer?: "AGENT" | "EPISODIC"): Promise<void> {
    await this.observe(kind, payload, layer);
  }
  async pubAssembleContext(purpose: Parameters<BaseIntelligentAgent["assembleContext"]>[0]) {
    return this.assembleContext(purpose, { text: "عنوان ثابت", signals: ["سیگنال"] });
  }
}

/** وضعیت آغازین یکسان برای هر پیکربندی: بازخورد مثبت هم‌واژگان با عنوان بینش */
function freshStubs(): { memory: StubMemoryRepo; policy: StubPolicyRepo } {
  const memory = new StubMemoryRepo();
  const policy = new StubPolicyRepo();
  memory.feedbacks.push(
    {
      id: "seed-fb-1",
      createdAt: stubNow(),
      tileId: "echo",
      insightKey: "echo-card",
      insightTitle: "عنوان ثابت",
      rating: 1,
      comment: "عنوان ثابت مفید بود",
      context: "{}",
    },
    {
      id: "seed-fb-2",
      createdAt: stubNow(),
      tileId: "echo",
      insightKey: "echo-card-2",
      insightTitle: "عنوان ثابت دوم",
      rating: -1,
      comment: "عنوان ثابت دوم تکراری بود",
      context: "{}",
    },
  );
  return { memory, policy };
}

async function captureEcho(agent: EchoAgent): Promise<string> {
  const stats = await agent.learningStats();
  const rendered = await agent.renderInsights();
  return JSON.stringify({ stats, rendered }, null, 2);
}

describe("P4 — اتصال BaseIntelligentAgent (observe/assembleContext)", () => {
  test("فرزند BaseLearningAgent باقی می‌ماند (زنجیره وراثت + سازنده بدون تغییر)", () => {
    const { memory, policy } = freshStubs();
    const agent = new EchoAgent({ memory, policy });
    expect(agent).toBeInstanceOf(BaseIntelligentAgent);
    expect(agent).toBeInstanceOf(BaseLearningAgent);
    expect(agent.tileId).toBe("echo");
  });

  test("observe بدون موتور حافظه → no-op بی‌صدا", async () => {
    const { memory, policy } = freshStubs();
    const agent = new EchoAgent({ memory, policy });
    await expect(agent.pubObserve("TEST", { text: "x" })).resolves.toBeUndefined();
    expect(memory.memories.length).toBe(0);
  });

  test("observe با موتور تزریقی → ثبت با tileId ایجنت و لایه پیش‌فرض AGENT", async () => {
    const { memory, policy } = freshStubs();
    const memEngine = new MemoryEngineImpl();
    const agent = new EchoAgent({ memory, policy, engines: { memory: memEngine } });
    await agent.pubObserve("RENDER", { text: "رندر بینش انجام شد" });
    await agent.pubObserve("CLICK", { text: "کلیک روی کارت" }, "EPISODIC");
    const rows = await memEngine.query({ tileId: "echo" });
    expect(rows.length).toBe(2);
    expect(rows.every((r) => r.tileId === "echo")).toBe(true);
    expect(rows.filter((r) => r.kind === "RENDER")[0].layer).toBe("AGENT");
    expect(rows.filter((r) => r.kind === "CLICK")[0].layer).toBe("EPISODIC");
    // انبار والد (stub) دست‌نخورده مانده — observe فقط موتور را می‌نویسد
    expect(memory.memories.length).toBe(0);
  });

  test("observe با درگاه خطادار → خطا بلعیده می‌شود", async () => {
    const { memory, policy } = freshStubs();
    const broken = {
      contractVersion: 1 as const,
      append: async () => {
        throw new Error("boom");
      },
      query: async () => [],
    };
    const agent = new EchoAgent({ memory, policy, engines: { memory: broken } });
    await expect(agent.pubObserve("X", {})).resolves.toBeUndefined();
  });

  test("assembleContext با Placeholder پیش‌فرض → null", async () => {
    const { memory, policy } = freshStubs();
    const agent = new EchoAgent({ memory, policy, engines: createDefaultEngineDeps() });
    expect(await agent.pubAssembleContext("insight-render")).toBeNull();
  });

  test("assembleContext با ContextEngineImpl → WorkingContext کامل", async () => {
    const { memory, policy } = freshStubs();
    const memEngine = new MemoryEngineImpl();
    await memEngine.append({ tileId: "echo", layer: "EPISODIC", kind: "OBS", payload: { text: "عنوان ثابت رایج" } });
    const agent = new EchoAgent({
      memory,
      policy,
      engines: { context: new ContextEngineImpl({ memory: memEngine }) },
    });
    const wc = await agent.pubAssembleContext("insight-render");
    expect(wc).not.toBeNull();
    expect(wc!.base.tileId).toBe("echo");
    expect(wc!.base.purpose).toBe("insight-render");
    expect(wc!.memories.length).toBe(1);
    expect(wc!.contextText).toContain("عنوان ثابت رایج");
    expect(wc!.signals).toEqual(["سیگنال"]);
  });

  test("هم‌ارزی خروجی: بدون موتور ⇔ پیش‌فرض ⇔ بدنه‌های واقعی (+observe/assemble) — بایت‌به‌بایت", async () => {
    // پیکربندی A: بدون موتور
    const sa = freshStubs();
    const outA = await captureEcho(new EchoAgent({ memory: sa.memory, policy: sa.policy }));

    // پیکربندی B: پیش‌فرض (Placeholder زمینه)
    const sb = freshStubs();
    const outB = await captureEcho(
      new EchoAgent({ memory: sb.memory, policy: sb.policy, engines: createDefaultEngineDeps() }),
    );

    // پیکربندی C: بدنه‌های واقعی با حافظه از پیش پرشده
    const sc = freshStubs();
    const memEngineC = new MemoryEngineImpl();
    for (let i = 0; i < 12; i++) {
      await memEngineC.append({
        tileId: "echo",
        layer: i % 2 === 0 ? "EPISODIC" : "SEMANTIC",
        kind: "OBS",
        payload: { text: `خاطره آزمون ${i} عنوان ثابت`, sentiment: i % 3 === 0 ? 1 : 0 },
      });
    }
    const outC = await captureEcho(
      new EchoAgent({
        memory: sc.memory,
        policy: sc.policy,
        engines: { context: new ContextEngineImpl({ memory: memEngineC }), memory: memEngineC },
      }),
    );

    // پیکربندی D: مانند C اما observe/assembleContext پیش از خروجی صدا زده می‌شوند
    const sd = freshStubs();
    const memEngineD = new MemoryEngineImpl();
    for (let i = 0; i < 12; i++) {
      await memEngineD.append({
        tileId: "echo",
        layer: i % 2 === 0 ? "EPISODIC" : "SEMANTIC",
        kind: "OBS",
        payload: { text: `خاطره آزمون ${i} عنوان ثابت`, sentiment: i % 3 === 0 ? 1 : 0 },
      });
    }
    const agentD = new EchoAgent({
      memory: sd.memory,
      policy: sd.policy,
      engines: { context: new ContextEngineImpl({ memory: memEngineD }), memory: memEngineD },
    });
    await agentD.pubObserve("PRE_RENDER", { text: "پیش از رندر" });
    await agentD.pubAssembleContext("insight-render");
    const outD = await captureEcho(agentD);

    expect(outA).toBe(outB);
    expect(outA).toBe(outC);
    expect(outA).toBe(outD);
    // خروجی معنادار است (نه خالی) — RAG فعال
    const parsed = JSON.parse(outA) as { rendered: { insights: { key: string }[]; memoryHits: number } };
    expect(parsed.rendered.insights.length).toBe(2);
    expect(parsed.rendered.memoryHits).toBeGreaterThan(0);
  });
});
