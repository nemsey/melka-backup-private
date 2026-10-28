/**
 * melketun-requests.ts — PN-051 · فرمان ۳/۴/۵ — M8: فهرست مستقل درخواست‌های ملکتون
 * ---------------------------------------------------------------------------
 * عین الگوی M7 — مستقل از آگهی‌ها (خطای یکی دیگری را نمی‌ایستاند):
 *   · fetch   — /PublicPotentials (الگوی کشف PN-047 · KNOWN_BAD_PAGES صادقانه)
 *   · validate — Zod: id الزامی
 *   · merge   — syncMelketunRows با potentials تنها (قانون متخصص merge.ts)
 *   · delta   — هش کل ماژول → بی‌تغییر = صفر نوشتن (فرمان ۵)
 * فاز B: نمای خصوصی (contactName — متقاضی حیاتی) در همان فاز A ادغام است (PN-054).
 */

import { z } from "zod";
import {
  syncMelketunRows,
  loadSecretsFile,
  fetchModuleRows,
  type PotentialRow,
} from "./melketun-common";
import { openDelta, updateListStatus } from "./kernel";

export const LIST_ID = "m8-melketun-requests";

const rowSchema = z.object({ id: z.string().min(1) });

export function validateRow(row: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!row) return null;
  const parsed = rowSchema.safeParse(row);
  return parsed.success ? row : null;
}

export interface FastPassResult {
  fetched: number;
  upserted: number;
  skippedUnchanged: boolean;
  errors: string[];
  durationMs: number;
}

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

  const rows = await fetchModuleRows(base, secrets, "/PublicPotentials", "potentials", result.errors, opts.maxPages);
  result.fetched = rows.length;

  if (rows.length > 0 && delta.pageUnchanged(LIST_ID, "all", rows)) {
    result.skippedUnchanged = true;
    delta.commit(LIST_ID);
    updateListStatus(LIST_ID, { phase: "done", progressPct: 100, fetched: result.fetched, skippedUnchanged: 1 });
    result.durationMs = Date.now() - t0;
    return result;
  }

  const validated = rows
    .map((r) => validateRow(r))
    .filter((r): r is Record<string, unknown> => r !== null) as unknown as PotentialRow[];

  const sync = await syncMelketunRows({
    filings: [],
    potentials: validated,
    specialists: [],
    myFilings: [],
    users: {},
    funnel: { filings: null, potentials: null },
  });
  result.upserted = sync.upserted.requests;
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

export async function deepPass(): Promise<{ note: string }> {
  return { note: "M8: نمای خصوصی (متقاضی) در همان فاز A ادغام می‌شود (PN-054) — deep-pass جداگانه لازم نیست" };
}
