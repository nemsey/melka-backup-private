/**
 * P5-10 — جدول مقایسه: VectorSearch در برابر KeywordSearch در برابر Hybrid (RRF)
 * ------------------------------------------------------
 * روی همان پیکره ۱۲ حافظه‌ای اثبات P5-08 (عین متن‌ها)، سه پرسش نمایندگی:
 * تطبیق واژگانی صریح / تطبیق واژگانی ناقص / پرسش مرتبط بدون تطبیق کلمه‌ای.
 * خروجی: جدول markdown برای گزارش تکمیل PHASE 5 + گواهی کیفی «Hybrid ≥ هر یک».
 *
 * اجرا: bun scripts/verify-p5-10.ts (صفر DB — همه چیز در-حافظه)
 */

import { InMemoryStore, type MemoryRecord } from "../src/core/intelligence/memory/memory-store";
import { embedText } from "../src/core/intelligence/memory/vector-index";
import { createHybridRetriever } from "../src/core/intelligence/retrieval/hybrid-retriever";
import { RetrievalEngineImpl } from "../src/core/intelligence/retrieval/retrieval-engine";

const TEXTS = [
  "جامعه مشتریان درخواست ملک رشد کرده است",
  "امتیاز سلامت مشتریان بهبود یافت",
  "چرخه عمر مشتریان فعال گزارش شد",
  "اقدام بعدی برای مشتری راکد تعیین شد",
  "موتور تطبیق درخواست سه تطبیق جدید یافت",
  "هشدار ریزش مشتری ارسال شد",
  "رویدادهای مشتری ثبت شد",
  "ثبت آرم برای درخواست آماده انجام شد",
  "درخواست ناقص مشتری تکمیل شد",
  "مشتری تبدیل‌شده به معامله شناسایی شد",
  "جامعه مشتریان گزارش هفتگی",
  "تطبیق درخواست با آگهی لیل",
];

const QUERIES = [
  { label: "تطبیق واژگانی صریح", q: "جامعه مشتریان گزارش هفتگی" },
  { label: "واژگان چسبیده/جدا", q: "ولیعصر" },
  { label: "مرتبط بدون تطبیق کلمه‌ای", q: "سلامت و بهبود مشتری" },
];

async function main() {
  const store = new InMemoryStore();
  const records: MemoryRecord[] = [];
  let seq = 0;
  for (const text of TEXTS) {
    seq += 1;
    const r: MemoryRecord = {
      id: `m${String(seq).padStart(2, "0")}`,
      tileId: "requests",
      layer: seq % 2 === 0 ? "SEMANTIC" : "EPISODIC",
      kind: "OBS",
      text,
      sentiment: 0,
      createdAt: new Date(Date.now() - seq * 3_600_000).toISOString(),
      embedding: embedText(text),
    };
    records.push(r);
    await store.save(r);
  }

  const handle = await createHybridRetriever({ store });
  const label = (id: string) => `m${id.slice(1)}`;

  const rows: string[] = [];
  rows.push("| پرسش | VectorSearch (top-3) | KeywordSearch BM25 (top-3) | Hybrid RRF (top-3) |");
  rows.push("|---|---|---|---|");

  for (const { label: ql, q } of QUERIES) {
    const vec = handle.vectorIndex.search(embedText(q), 3).map((h) => `${label(h.id)} (${h.score.toFixed(3)})`);
    const kw = handle.keywordSearch.search(q, 3).map((h) => `${label(h.id)} (${h.score.toFixed(2)})`);
    const hy = (await handle.retriever.retrieve({ text: q }, { topK: 3 })).map(
      (i) => `${label(i.record.id)} (${i.score.toFixed(4)}${i.sources.length === 2 ? "،دو-منبع" : ""})`,
    );
    rows.push(`| ${ql}: «${q}» | ${vec.join(" · ") || "—"} | ${kw.join(" · ") || "—"} | ${hy.join(" · ") || "—"} |`);
  }

  // گواهی کیفی: برای هر پرسش، برترین Hybrid یا از هر دو منبع است یا همان برترینِ بهترینِ تک‌منبعی
  let qualityOk = true;
  const notes: string[] = [];
  for (const { label: ql, q } of QUERIES) {
    const hy = await handle.retriever.retrieve({ text: q }, { topK: 3 });
    const vec = new Set(handle.vectorIndex.search(embedText(q), 3).map((h) => h.id));
    const kw = new Set(handle.keywordSearch.search(q, 3).map((h) => h.id));
    if (hy.length === 0) continue;
    const top = hy[0];
    const dual = top.sources.length === 2;
    const matchesBestSingle =
      (kw.size > 0 && top.record.id === [...kw][0]) || (vec.size > 0 && top.record.id === [...vec][0]);
    if (!dual && !matchesBestSingle) qualityOk = false;
    notes.push(
      `${ql}: برترین Hybrid ${dual ? "از هر دو منبع" : matchesBestSingle ? "همان برترینِ یک روش تک‌منبعی" : "بدون پشتوانه"}`,
    );
  }

  // پوشش ترکیبی: اجتماع نتایج Hybrid (top-3) ⊇ اشتراک منظر کلیدی هر دو روش در پرسش اول؟
  const q1 = QUERIES[0].q;
  const hy1 = new Set((await handle.retriever.retrieve({ text: q1 }, { topK: 5 })).map((i) => i.record.id));
  const kw1 = new Set(handle.keywordSearch.search(q1, 3).map((h) => h.id));
  const kwCovered = [...kw1].every((id) => hy1.has(id));

  console.log(rows.join("\n"));
  console.log("");
  for (const n of notes) console.log(`- ${n}`);
  console.log(`- پوشش کلیدواژه‌ای در Hybrid (پرسش ۱، top-5): ${kwCovered ? "کامل" : "ناقص"}`);
  console.log("");
  console.log(
    qualityOk && kwCovered
      ? "گواهی: Hybrid در هر سه پرسش ≥ هر یک از دو روش تک‌منبعی است (برترین یا دو-منبعی است یا همان برترین تک‌منبعی، و پوشش کلیدواژه‌ای کامل حفظ شده)."
      : "هشدار: در حداقل یک پرسش Hybrid از تک‌منبعی ضعیف‌تر بود — نیازمند تحلیل وزن RRF.",
  );
  if (!qualityOk || !kwCovered) process.exit(1);
}

main().catch((err) => {
  console.error("خطای verify-p5-10:", err);
  process.exit(1);
});
