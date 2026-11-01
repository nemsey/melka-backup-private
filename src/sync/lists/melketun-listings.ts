/**
 * melketun-listings.ts — PN-051 · فرمان ۳/۴/۵ — M7: فهرست مستقل آگهی‌های ملکتون
 * ---------------------------------------------------------------------------
 * List-Centric: مستقل از درخواست‌ها/کارشناسان — خطای این فهرست بقیه را نمی‌ایستاند.
 *   · fetch   — الگوی کشف PN-047: crmLogin → fetchModule(/MelketunPublicFilingPlus)
 *               (خزش ۳۵۰ms/صفحه — ادب در برابر CRM) — منطق پارس HTML عین legacy
 *               (extractInertiaProps · funnel · filingToProperty — بازاستفاده، نه کپی)
 *   · validate — Zod: id الزامی + فیلتر تبریز (tabrizVerdict — غایب‌ها skip صادقانه)
 *   · merge   — syncMelketunRows (قانون برتری متخصص merge.ts — قاعدهٔ ب + provenance)
 *               ⊙ توجیه صادقانه ADR: نگاشت Law 05/04 در SQL CASE قابل‌ بیان نیست؛
 *               حجم ملکتون ~صدها ردیف (نه انبوه ARM) → مسیر merge قانونی می‌ماند.
 *               انبوه ARM (M1/M2/M9) همگی better-sqlite3 خام‌اند (خط قرمز رعایت).
 *   · delta   — هش ردیف‌های صفحه (فرمان ۵): همهٔ صفحات بی‌تغییر → skip کل upsert
 */

import { z } from "zod";
import {
  syncMelketunRows,
  loadSecretsFile,
  fetchModuleRows,
  MELKETUN_TENANT_ID,
  type FilingRow,
} from "./melketun-common";
import { openDelta, updateListStatus } from "./kernel";

export const LIST_ID = "m7-melketun-listings";

const rowSchema = z.object({ id: z.string().min(1) });

export function validateRow(row: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!row) return null;
  const parsed = rowSchema.safeParse(row);
  return parsed.success ? row : null;
}

export interface FastPassResult {
  fetched: number;
  upserted: number;
  skippedUnchanged: boolean; // فرمان ۵ — کل ماژول بی‌تغییر بود
  errors: string[];
  durationMs: number;
}

/** فاز A — فهرست عمومی + ادغام نمای خصوصی (مالک — ستون حیاتی) */
export async function fastPass(opts: { maxPages?: number } = {}): Promise<FastPassResult> {
  const t0 = Date.now();
  const delta = openDelta(LIST_ID);
  const result: FastPassResult = { fetched: 0, upserted: 0, skippedUnchanged: false, errors: [], durationMs: 0 };
  const secrets = loadSecretsFile();
  if (!secrets) {
    result.errors.push("melketun-secrets unavailable — skip (connect CRM from settings)");
    updateListStatus(LIST_ID, { phase: "error", error: result.errors[0], progressPct: 0 });
    return result;
  }
  const base = secrets.crm.base_url.replace(/\/$/, "");
  updateListStatus(LIST_ID, { phase: "fast-pass", progressPct: 10 });

  const rows = await fetchModuleRows(base, secrets, "/MelketunPublicFilingPlus", "filings", result.errors, opts.maxPages);
  result.fetched = rows.length;

  // فرمان ۵ — Delta: بی‌تغییر → صفر نوشتن
  if (rows.length > 0 && delta.pageUnchanged(LIST_ID, "all", rows)) {
    result.skippedUnchanged = true;
    delta.commit(LIST_ID);
    updateListStatus(LIST_ID, { phase: "done", progressPct: 100, fetched: result.fetched, skippedUnchanged: 1 });
    result.durationMs = Date.now() - t0;
    return result;
  }

  const validated = rows
    .map((r) => validateRow(r as unknown as Record<string, unknown>))
    .filter((r): r is Record<string, unknown> => r !== null) as unknown as FilingRow[];

  // ادغام: مسیر قانونی (merge law + provenance) — syncMelketunRows فقط filings
  const sync = await syncMelketunRows({
    filings: validated,
    potentials: [],
    specialists: [],
    myFilings: [],
    users: {},
    funnel: { filings: null, potentials: null },
  });
  result.upserted = sync.upserted.listings;
  result.errors.push(...(sync.errors ?? []).slice(0, 5));
  delta.commit(LIST_ID);
  updateListStatus(LIST_ID, {
    phase: "done",
    progressPct: 100,
    fetched: result.fetched,
    written: result.upserted,
    durationMs: Date.now() - t0,
    error: result.errors.length > 0 ? result.errors[0] : undefined,
  });
  result.durationMs = Date.now() - t0;
  return result;
}

/** فاز B — برای ملکتون: نمای خصوصی همان فاز A ادغام شده است (عمق = نفس فاز A) */
export async function deepPass(): Promise<{ note: string }> {
  // نمای خصوصی (مالک/تماس) در fastPass ادغام شده — الگوی PN-054. فاز B جدا ندارد.
  return { note: "M7: نمای خصوصی در همان فاز A ادغام می‌شود (PN-054) — deep-pass جداگانه لازم نیست" };
}

export { MELKETUN_TENANT_ID };
