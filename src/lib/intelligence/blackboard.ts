/**
 * §۷.۲ — Blackboard Pattern (سند ۰۲۷)
 * ---------------------------------------------------------------------------
 * تختهٔ سیاه مشترک موتورها در src/lib/intelligence/blackboard/:
 *  · هر موتور می‌تواند بنویسد · صفر حذف (فقط append) · TTL: ۳۰ روز
 * ذخیره‌سازی: فایل JSONL مسیر intelligence-data/blackboard.jsonl
 */

import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

export type BlackboardNamespace = "p7" | "p8" | "p9" | "p10" | "p11" | "daemon";

export interface BlackboardEntry<T = unknown> {
  id: string;
  namespace: BlackboardNamespace;
  engineId: string;
  writtenAt: string;
  payload: T;
  /** md5 برای اثبات تغییر نکردن (قانون شاهد §۸) */
  hash: string;
}

const TTL_DAYS = 30;
const FILE = path.join(process.cwd(), "intelligence-data", "blackboard.jsonl");

function md5(s: string): string {
  return createHash("md5").update(s).digest("hex");
}

/** نوشتن روی تخته — فقط append، هرگز حذف (قانون §۷.۲) */
export async function blackboardWrite<T>(namespace: BlackboardNamespace, engineId: string, payload: T): Promise<BlackboardEntry<T>> {
  const entry: BlackboardEntry<T> = {
    id: `bb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    namespace,
    engineId,
    writtenAt: new Date().toISOString(),
    payload,
    hash: "",
  };
  entry.hash = md5(JSON.stringify({ namespace, engineId, writtenAt: entry.writtenAt, payload }));
  await mkdir(path.dirname(FILE), { recursive: true });
  await appendFile(FILE, `${JSON.stringify(entry)}\n`, "utf8");
  return entry;
}

/** خواندن تخته با پالایهٔ TTL ۳۰ روز (خواندهٔ منقضی پنهان می‌شود اما حذف نمی‌شود) */
export async function blackboardRead(opts: { namespace?: BlackboardNamespace; engineId?: string; includeExpired?: boolean } = {}): Promise<BlackboardEntry[]> {
  if (!existsSync(FILE)) return [];
  const raw = await readFile(FILE, "utf8");
  const cutoff = Date.now() - TTL_DAYS * 86400000;
  const out: BlackboardEntry[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line) as BlackboardEntry;
      if (opts.namespace && e.namespace !== opts.namespace) continue;
      if (opts.engineId && e.engineId !== opts.engineId) continue;
      if (!opts.includeExpired && new Date(e.writtenAt).getTime() < cutoff) continue;
      out.push(e);
    } catch {
      /* خط ناقص نادیده — تخته فقط append است */
    }
  }
  return out;
}

/** فشرده‌سازی فیزیکی فایل: فقط نگهداری ورودی‌های داخل TTL (منطقی همان append است) */
export async function blackboardCompact(): Promise<{ kept: number; dropped: number }> {
  const all = await blackboardRead({ includeExpired: true });
  const cutoff = Date.now() - TTL_DAYS * 86400000;
  const kept = all.filter((e) => new Date(e.writtenAt).getTime() >= cutoff);
  await writeFile(FILE, kept.map((e) => JSON.stringify(e)).join("\n") + (kept.length ? "\n" : ""), "utf8");
  return { kept: kept.length, dropped: all.length - kept.length };
}

/** راستی‌آزمایی زنجیرهٔ هش تخته — هر ورودی دست‌نخورده است */
export async function blackboardVerify(): Promise<{ total: number; intact: number }> {
  const all = await blackboardRead({ includeExpired: true });
  let intact = 0;
  for (const e of all) {
    const expect = md5(JSON.stringify({ namespace: e.namespace, engineId: e.engineId, writtenAt: e.writtenAt, payload: e.payload }));
    if (expect === e.hash) intact += 1;
  }
  return { total: all.length, intact };
}

/* ═══════════ §۷.۳ — Event Bus ═══════════ */

export type IntelligenceEventName =
  | "prediction.created"
  | "outcome.recorded"
  | "evaluation.completed"
  | "policy.proposed"
  | "policy.activated"
  | "policy.retired"
  | "decision.proposed"
  | "decision.approved"
  | "diagnosis.completed"
  | "repair.proposed"
  | "repair.executed"
  | "repair.rolled_back";

export interface IntelligenceEvent {
  name: IntelligenceEventName;
  at: string;
  detail: Record<string, unknown>;
}

type Handler = (e: IntelligenceEvent) => void | Promise<void>;

const handlers = new Map<IntelligenceEventName, Handler[]>();

/** انتشار رویداد به همهٔ گوش‌دهنده‌ها + ثبت روی تختهٔ سیاه */
export async function emitEvent(name: IntelligenceEventName, detail: Record<string, unknown>): Promise<IntelligenceEvent> {
  const event: IntelligenceEvent = { name, at: new Date().toISOString(), detail };
  for (const h of handlers.get(name) ?? []) await h(event);
  await blackboardWrite("daemon", "event-bus", event);
  return event;
}

export function onEvent(name: IntelligenceEventName, handler: Handler): void {
  handlers.set(name, [...(handlers.get(name) ?? []), handler]);
}

/* ═══════════ §۸.۳ — Evidence Network ═══════════ */

export interface EvidenceFile {
  path: string;
  description: string;
  md5: string;
  bytes: number;
  capturedAt: string;
}

/** استخراج شاهد از هر run: ذخیره در download/pN/ + محاسبهٔ hash (قانون شاهد §۸.۲) */
export async function captureEvidence(targetDir: string, fileName: string, content: string, description: string): Promise<EvidenceFile> {
  await mkdir(targetDir, { recursive: true });
  const p = path.join(targetDir, fileName);
  await writeFile(p, content, "utf8");
  return { path: p, description, md5: md5(content), bytes: Buffer.byteLength(content), capturedAt: new Date().toISOString() };
}
