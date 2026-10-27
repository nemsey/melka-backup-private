/**
 * PN-050 · دستور ۳ — قانون برتری به‌روزرسانی متخصص + ادغام میدانی (DIR-PN050-001)
 * ---------------------------------------------------------------------------
 * پنج قاعدهٔ ادغام (ترتیب اولویت — عین دستور):
 *   الف) null در incoming و پر در existing  → existing (دادهٔ مقدس — G2)
 *   ب) shouldAcceptExpertUpdate             → incoming + audit_log(expert_override)
 *   ج) incoming.confidence > existing       → incoming
 *   د) برابری اطمینان                      → جدیدترین (modifiedAt)
 *   ه) در غیر این صورت                      → existing
 *
 * قوانین حاکم:
 *   ۰۴ — null روی پر نمی‌نشیند (Sacred Data)
 *   ۰۵ — به‌روزرسانی متخصص همیشه برنده (به‌جز null)
 *   ۱۰ — PII خام در audit_log ممنوع (رد حسابرسی فقط نام فیلد/شناسه می‌گیرد)
 *   ۱۴ — additive-only: هیچ فیلدی که merge رد کرد در payload نوشته نمی‌شود
 *
 * provenance (دستور ۲): هر پذیرش، نقشهٔ lastSyncedValue و آرایهٔ fieldChanges
 * (سقف ۱۰۰ مدخل) را تازه می‌کند — مبنای پنل «تغییرات اخیر» و بازگردانی.
 */

import type { PrismaClient } from "@prisma/client";
import { stripProtectedNulls } from "@/lib/integrations/melketun/protected-nulls"; // G1 (DIR-PN048-007)

// ─── منابع و اعتبارها ───────────────────────────────────────────────────────

/** نمای خصوصی CRM (myFilings/پتانسیل‌های شعبه) — ویرایش مستقیم کارشناس */
export const SOURCE_CRM_PRIVATE = "CRM_private" as const;
/** نمای عمومی CRM ملکتون */
export const SOURCE_CRM_PUBLIC = "melketun-crm-public" as const;
/** عملیات مالک از پنل/مسیرهای PATCH */
export const SOURCE_OWNER = "owner" as const;

/** اعتبار منابع (قانون ۰۵: متخصص با confidence پایین‌تر هم برندهٔ قاعدهٔ ب است) */
export const CONFIDENCE = {
  [SOURCE_CRM_PRIVATE]: 0.98,
  [SOURCE_CRM_PUBLIC]: 0.75,
  [SOURCE_OWNER]: 1.0,
} as const;

export type ChangeKind = "expert_override" | "enrichment" | "manual_revert";

// ─── نرمال‌سازی و برابری ───────────────────────────────────────────────────

/** تهی/نال به null — رشتهٔ خالی مثل null (هم‌ارز G1) */
export function normValue(v: unknown): unknown {
  if (v === undefined || v === null) return null;
  if (typeof v === "string" && v.trim() === "") return null;
  return v;
}

/** برابری مقادیر بعد از نرمال‌سازی (null ≡ undefined ≡ «») */
export function valuesEqual(a: unknown, b: unknown): boolean {
  return normValue(a) === normValue(b);
}

// ─── قانون ب: پذیرش اجباری به‌روزرسانی متخصص ────────────────────────────────

export interface ExpertUpdateCtx {
  field: string;
  /** مقدار ورودی (غیر-null بودن شرط است) */
  incoming: { value: unknown; source: string; confidence?: number };
  /** آخرین مقدارِ پذیرفته‌شدهٔ سینک برای این فیلد (provenance) */
  lastSyncedValue?: unknown;
  /** زمان آخرین پذیرش سینک برای این فیلد */
  lastSyncedAt?: Date | string | null;
  /** زمان دادهٔ ورودی — قدیمی‌تر از lastSyncedAt رد می‌شود */
  modifiedAt: Date | string;
}

/**
 * قاعدهٔ ب — عین دستور ۳:
 *   incoming.value غیر-null · incoming.source === 'CRM_private' ·
 *   incoming.value !== lastSyncedValue · incoming.modifiedAt >= lastSyncedAt
 *   → true (پذیرش اجباری — قانون ۰۵)
 */
export function shouldAcceptExpertUpdate(ctx: ExpertUpdateCtx): boolean {
  const v = normValue(ctx.incoming.value);
  if (v === null) return false; // متخصص فقط با مقدار واقعی برنده می‌شود (به‌جز null)
  if (ctx.incoming.source !== SOURCE_CRM_PRIVATE) return false;
  if (valuesEqual(v, ctx.lastSyncedValue)) return false; // بدون تغییر → عملیات بی‌اثر
  const modifiedAt = new Date(ctx.modifiedAt).getTime();
  const lastSyncedAt = ctx.lastSyncedAt ? new Date(ctx.lastSyncedAt).getTime() : 0;
  if (Number.isNaN(modifiedAt)) return false;
  if (modifiedAt < lastSyncedAt) return false; // دادهٔ کهنه (bootstrap) بر تازه نمی‌نشیند
  return true;
}

// ─── mergeField — قلب قانون (الف→ب→ج→د→ه) ─────────────────────────────────

export interface MergeFieldCtx {
  field: string;
  incoming: { value: unknown; source: string; confidence: number; modifiedAt: Date };
  existing: {
    value: unknown;
    confidence?: number; // پیش‌فرض ۰ (بدون provenance)
    lastSyncedValue?: unknown;
    lastSyncedAt?: Date | string | null;
  };
}

export interface MergeFieldResult {
  accepted: boolean;
  /** مقدار نهایی فیلد (پذیرفته = incoming · رد = existing) */
  value: unknown;
  kind?: ChangeKind;
  reason:
    | "sacred_null_guard" // الف — null روی پر ننشست (رد)
    | "both_null"
    | "fill_empty" // فیلد خالی + دادهٔ واقعی → افزودنی
    | "unchanged" // هم‌ارز مقدار فعلی → بی‌اثر (هیچ ردی نمی‌نویسد)
    | "expert_override" // ب
    | "higher_confidence" // ج
    | "newest" // د
    | "keep_existing"; // ه
}

/** ادغام یک فیلد — خالص و بی‌عوارض (تست‌پذیر) */
export function mergeField(ctx: MergeFieldCtx): MergeFieldResult {
  const inc = normValue(ctx.incoming.value);
  const ex = normValue(ctx.existing.value);
  const lastSyncedValue = "lastSyncedValue" in ctx.existing ? ctx.existing.lastSyncedValue : undefined;
  const lastSyncedAt = ctx.existing.lastSyncedAt ?? null;
  const exConfidence = ctx.existing.confidence ?? 0;

  // الف) دادهٔ مقدس — null/تهی هرگز روی پر نمی‌نشیند
  if (inc === null && ex !== null) {
    return { accepted: false, value: ctx.existing.value, reason: "sacred_null_guard" };
  }
  if (inc === null && ex === null) {
    return { accepted: false, value: null, reason: "both_null" };
  }
  // فیلد خالی + مقدار واقعی → پذیرش افزودنی (enrichment)
  if (ex === null) {
    return { accepted: true, value: ctx.incoming.value, kind: "enrichment", reason: "fill_empty" };
  }
  // بدون تغییر واقعی → بی‌اثر (هیچ ردی در fieldChanges/audit نمی‌گذارد)
  if (valuesEqual(inc, ex)) {
    return { accepted: false, value: ctx.existing.value, reason: "unchanged" };
  }
  // ب) قانون برتری متخصص — پیش از confidence (قانون ۰۵)
  if (
    shouldAcceptExpertUpdate({
      field: ctx.field,
      incoming: { value: inc, source: ctx.incoming.source, confidence: ctx.incoming.confidence },
      lastSyncedValue,
      lastSyncedAt,
      modifiedAt: ctx.incoming.modifiedAt,
    })
  ) {
    return { accepted: true, value: ctx.incoming.value, kind: "expert_override", reason: "expert_override" };
  }
  // ج) اطمینان بالاتر برنده می‌شود
  if (ctx.incoming.confidence > exConfidence) {
    return { accepted: true, value: ctx.incoming.value, kind: "enrichment", reason: "higher_confidence" };
  }
  // د) برابری اطمینان → جدیدترین (ورودی تازه‌تر از آخرین سینک باشد)
  if (ctx.incoming.confidence === exConfidence) {
    const incT = ctx.incoming.modifiedAt.getTime();
    const lastT = lastSyncedAt ? new Date(lastSyncedAt).getTime() : 0;
    if (incT > lastT) {
      return { accepted: true, value: ctx.incoming.value, kind: "enrichment", reason: "newest" };
    }
  }
  // ه) نگه‌داشت مقدار فعلی
  return { accepted: false, value: ctx.existing.value, reason: "keep_existing" };
}

// ─── مشخصهٔ فیلدها (property · request) ───────────────────────────────────

export interface IncomingFieldSpec {
  source: string;
  confidence: number;
}

/** فیلدهای داده‌ای آگهی — منبع خصوصی (myFilings/نمای خصوصی) در برابر عمومی */
export const PROPERTY_FIELD_SPECS: Record<string, IncomingFieldSpec> = {
  // CRM خصوصی — ویرایش کارشناس (قانون ۰۵)
  rawOwnerName: { source: SOURCE_CRM_PRIVATE, confidence: CONFIDENCE[SOURCE_CRM_PRIVATE] },
  rawOwnerMobile: { source: SOURCE_CRM_PRIVATE, confidence: CONFIDENCE[SOURCE_CRM_PRIVATE] },
  ownerMobile: { source: SOURCE_CRM_PRIVATE, confidence: CONFIDENCE[SOURCE_CRM_PRIVATE] },
  address: { source: SOURCE_CRM_PRIVATE, confidence: CONFIDENCE[SOURCE_CRM_PRIVATE] },
  // نمای عمومی CRM
  title: { source: SOURCE_CRM_PUBLIC, confidence: CONFIDENCE[SOURCE_CRM_PUBLIC] },
  status: { source: SOURCE_CRM_PUBLIC, confidence: CONFIDENCE[SOURCE_CRM_PUBLIC] },
  ownerName: { source: SOURCE_CRM_PUBLIC, confidence: CONFIDENCE[SOURCE_CRM_PUBLIC] },
  areaName: { source: SOURCE_CRM_PUBLIC, confidence: CONFIDENCE[SOURCE_CRM_PUBLIC] },
  propertyTypeName: { source: SOURCE_CRM_PUBLIC, confidence: CONFIDENCE[SOURCE_CRM_PUBLIC] },
  tradeTypeName: { source: SOURCE_CRM_PUBLIC, confidence: CONFIDENCE[SOURCE_CRM_PUBLIC] },
  price: { source: SOURCE_CRM_PUBLIC, confidence: CONFIDENCE[SOURCE_CRM_PUBLIC] },
  meterage: { source: SOURCE_CRM_PUBLIC, confidence: CONFIDENCE[SOURCE_CRM_PUBLIC] },
  depositPrice: { source: SOURCE_CRM_PUBLIC, confidence: CONFIDENCE[SOURCE_CRM_PUBLIC] },
  rentPrice: { source: SOURCE_CRM_PUBLIC, confidence: CONFIDENCE[SOURCE_CRM_PUBLIC] },
  isRental: { source: SOURCE_CRM_PUBLIC, confidence: CONFIDENCE[SOURCE_CRM_PUBLIC] },
  imageCount: { source: SOURCE_CRM_PUBLIC, confidence: CONFIDENCE[SOURCE_CRM_PUBLIC] },
  cityName: { source: SOURCE_CRM_PUBLIC, confidence: CONFIDENCE[SOURCE_CRM_PUBLIC] },
  stateName: { source: SOURCE_CRM_PUBLIC, confidence: CONFIDENCE[SOURCE_CRM_PUBLIC] },
  armBranchTitle: { source: SOURCE_CRM_PUBLIC, confidence: CONFIDENCE[SOURCE_CRM_PUBLIC] },
  detailsJson: { source: SOURCE_CRM_PUBLIC, confidence: CONFIDENCE[SOURCE_CRM_PUBLIC] },
  rawPrice: { source: SOURCE_CRM_PUBLIC, confidence: CONFIDENCE[SOURCE_CRM_PUBLIC] },
  createdAt: { source: SOURCE_CRM_PUBLIC, confidence: CONFIDENCE[SOURCE_CRM_PUBLIC] },
};

/** فیلدهای داده‌ای درخواست — متقاضی/موبایل از نمای خصوصی CRM (PN-051) */
export const REQUEST_FIELD_SPECS: Record<string, IncomingFieldSpec> = {
  // CRM خصوصی — ویرایش کارشناس روی پتانسیل (قانون ۰۵)
  customerName: { source: SOURCE_CRM_PRIVATE, confidence: CONFIDENCE[SOURCE_CRM_PRIVATE] },
  rawCustomerName: { source: SOURCE_CRM_PRIVATE, confidence: CONFIDENCE[SOURCE_CRM_PRIVATE] },
  customerMobile: { source: SOURCE_CRM_PRIVATE, confidence: CONFIDENCE[SOURCE_CRM_PRIVATE] },
  rawCustomerMobile: { source: SOURCE_CRM_PRIVATE, confidence: CONFIDENCE[SOURCE_CRM_PRIVATE] },
  // نمای عمومی CRM
  title: { source: SOURCE_CRM_PUBLIC, confidence: CONFIDENCE[SOURCE_CRM_PUBLIC] },
  areaNamesJson: { source: SOURCE_CRM_PUBLIC, confidence: CONFIDENCE[SOURCE_CRM_PUBLIC] },
  propertyTypeName: { source: SOURCE_CRM_PUBLIC, confidence: CONFIDENCE[SOURCE_CRM_PUBLIC] },
  tradeTypeName: { source: SOURCE_CRM_PUBLIC, confidence: CONFIDENCE[SOURCE_CRM_PUBLIC] },
  priceFrom: { source: SOURCE_CRM_PUBLIC, confidence: CONFIDENCE[SOURCE_CRM_PUBLIC] },
  priceTo: { source: SOURCE_CRM_PUBLIC, confidence: CONFIDENCE[SOURCE_CRM_PUBLIC] },
  depositBudget: { source: SOURCE_CRM_PUBLIC, confidence: CONFIDENCE[SOURCE_CRM_PUBLIC] },
  rentBudget: { source: SOURCE_CRM_PUBLIC, confidence: CONFIDENCE[SOURCE_CRM_PUBLIC] },
  status: { source: SOURCE_CRM_PUBLIC, confidence: CONFIDENCE[SOURCE_CRM_PUBLIC] },
  actorName: { source: SOURCE_CRM_PUBLIC, confidence: CONFIDENCE[SOURCE_CRM_PUBLIC] },
  armBranchTitle: { source: SOURCE_CRM_PUBLIC, confidence: CONFIDENCE[SOURCE_CRM_PUBLIC] },
  inputsJson: { source: SOURCE_CRM_PUBLIC, confidence: CONFIDENCE[SOURCE_CRM_PUBLIC] },
  stateName: { source: SOURCE_CRM_PUBLIC, confidence: CONFIDENCE[SOURCE_CRM_PUBLIC] },
  cityName: { source: SOURCE_CRM_PUBLIC, confidence: CONFIDENCE[SOURCE_CRM_PUBLIC] },
  createdAt: { source: SOURCE_CRM_PUBLIC, confidence: CONFIDENCE[SOURCE_CRM_PUBLIC] },
};

/** فیلدهای metadata سینک — همیشه در payload (غیر از هویت: id/کد طبیعی) */
export const PROPERTY_META_FIELDS = [
  "tenantId", "sourceRunId", "extractedAt", "extractionBatchId",
  "normalizationVersion", "rawSourceVersion", "syncedAt",
] as const;

export const REQUEST_META_FIELDS = [
  "source", "actorCode", "tenantId", "sourceRunId", "extractedAt", "extractionBatchId",
  "normalizationVersion", "rawSourceVersion",
] as const;

// ─── provenance — نقشه و تغییرات (دستور ۲) ─────────────────────────────────

export interface ProvenanceEntry {
  value: unknown;
  source: string;
  confidence: number;
  at: string; // ISO
}

export interface FieldChangeEntry {
  field: string;
  from: unknown;
  to: unknown;
  kind: ChangeKind;
  at: string; // ISO
  runId?: string;
  fromSource?: string;
  toSource?: string;
}

/** سقف آرایهٔ fieldChanges — آخرین‌ها می‌مانند (پنل فقط بازهٔ ۳۰روزه می‌خواهد) */
export const FIELD_CHANGES_CAP = 100;

export function parseProvenanceMap(json: unknown): Record<string, ProvenanceEntry> {
  if (typeof json !== "string" || !json) return {};
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, ProvenanceEntry>) : {};
  } catch {
    return {};
  }
}

export function parseFieldChanges(json: unknown): FieldChangeEntry[] {
  if (typeof json !== "string" || !json) return [];
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? (parsed as FieldChangeEntry[]) : [];
  } catch {
    return [];
  }
}

// ─── mergeRecord — ادغای کل رکورد ──────────────────────────────────────────

export interface MergeRecordCtx {
  entity: "property" | "request";
  /** payload کامل خروجی filingToProperty/potentialToRequest */
  incoming: Record<string, unknown>;
  /** ردیف موجود DB (با ستون‌های provenance) یا null برای create */
  existing: Record<string, unknown> | null;
  /** زمان دادهٔ ورودی — سینک زنده: now · bootstrap: زمان شاهد (قدیمی) */
  modifiedAt: Date;
  runId: string;
}

export interface MergeRecordResult {
  /** payload نهایی create (existing=null) یا update (merge‌شده) — هنوز از stripProtectedNulls می‌گذرد */
  payload: Record<string, unknown>;
  changes: FieldChangeEntry[];
  expertFields: string[];
  provenance: Record<string, ProvenanceEntry>;
  acceptedCount: number;
  rejectedCount: number;
  created: boolean;
}

export function mergeRecord(ctx: MergeRecordCtx): MergeRecordResult {
  const specs = ctx.entity === "property" ? PROPERTY_FIELD_SPECS : REQUEST_FIELD_SPECS;
  const metaFields = ctx.entity === "property" ? PROPERTY_META_FIELDS : REQUEST_META_FIELDS;

  // ── مسیر create: رکورد جدید — payload عین incoming + provenance اولیه
  if (!ctx.existing) {
    const provenance: Record<string, ProvenanceEntry> = {};
    for (const [field, spec] of Object.entries(specs)) {
      if (field in ctx.incoming && normValue(ctx.incoming[field]) !== null) {
        provenance[field] = {
          value: ctx.incoming[field],
          source: spec.source,
          confidence: spec.confidence,
          at: ctx.modifiedAt.toISOString(),
        };
      }
    }
    const payload: Record<string, unknown> = { ...ctx.incoming };
    payload.lastSyncedValue = JSON.stringify(provenance);
    payload.lastSyncedAt = ctx.modifiedAt;
    payload.lastModifiedBy = primarySource(provenance);
    payload.lastModifiedAt = ctx.modifiedAt;
    return { payload, changes: [], expertFields: [], provenance, acceptedCount: 0, rejectedCount: 0, created: true };
  }

  // ── مسیر update: ادغای فیلد به فیلد
  const ex = ctx.existing;
  const oldProv = parseProvenanceMap(ex.lastSyncedValue);
  const oldChanges = parseFieldChanges(ex.fieldChanges);
  const provenance: Record<string, ProvenanceEntry> = {};
  const changes: FieldChangeEntry[] = [];
  const expertFields: string[] = [];
  const update: Record<string, unknown> = {};
  let accepted = 0;
  let rejected = 0;

  for (const [field, spec] of Object.entries(specs)) {
    if (!(field in ctx.incoming)) continue; // فیلد غایب در payload → G2: نوشتن ممنوع
    const prev = oldProv[field];
    const res = mergeField({
      field,
      incoming: {
        value: ctx.incoming[field],
        source: spec.source,
        confidence: spec.confidence,
        modifiedAt: ctx.modifiedAt,
      },
      existing: {
        value: ex[field],
        confidence: prev?.confidence ?? 0,
        lastSyncedValue: prev?.value,
        lastSyncedAt: prev?.at ?? (ex.lastSyncedAt as Date | string | null) ?? null,
      },
    });
    if (res.accepted) {
      accepted++;
      update[field] = res.value;
      provenance[field] = {
        value: res.value,
        source: spec.source,
        confidence: spec.confidence,
        at: ctx.modifiedAt.toISOString(),
      };
      changes.push({
        field,
        from: ex[field] ?? null,
        to: res.value,
        kind: res.kind ?? "enrichment",
        at: ctx.modifiedAt.toISOString(),
        runId: ctx.runId,
        fromSource: prev?.source,
        toSource: spec.source,
      });
      if (res.kind === "expert_override") expertFields.push(field);
    } else {
      rejected++;
      if (prev) provenance[field] = prev; // نگه‌داشت provenance فیلد رد‌شده
    }
  }

  // metadata سینک — همیشه (غیر-null ها)؛ هویت (id/کد طبیعی) هرگز آپدیت نمی‌شود
  for (const m of metaFields) {
    if (m in ctx.incoming && normValue(ctx.incoming[m]) !== null) update[m] = ctx.incoming[m];
  }

  if (accepted > 0) {
    const mergedChanges = [...oldChanges, ...changes].slice(-FIELD_CHANGES_CAP);
    update.lastSyncedValue = JSON.stringify({ ...oldProv, ...provenance });
    update.lastSyncedAt = ctx.modifiedAt;
    update.lastModifiedAt = ctx.modifiedAt;
    update.lastModifiedBy = expertFields.length > 0 ? SOURCE_CRM_PRIVATE : primarySourceOf(update, specs, provenance);
    update.fieldChanges = JSON.stringify(mergedChanges);
  }

  return {
    payload: update,
    changes,
    expertFields,
    provenance: { ...oldProv, ...provenance },
    acceptedCount: accepted,
    rejectedCount: rejected,
    created: false,
  };
}

function primarySource(provenance: Record<string, ProvenanceEntry>): string {
  const sources = Object.values(provenance).map((p) => p.source);
  if (sources.includes(SOURCE_CRM_PRIVATE)) return SOURCE_CRM_PRIVATE;
  return sources[0] ?? SOURCE_CRM_PUBLIC;
}

function primarySourceOf(
  _update: Record<string, unknown>,
  _specs: Record<string, IncomingFieldSpec>,
  provenance: Record<string, ProvenanceEntry>,
): string {
  return primarySource(provenance);
}

// ─── چسب DB — upsert با ادغام (مسیر رسمی سینک ملکتون از این پس) ─────────────

export interface UpsertMergeOpts {
  client?: PrismaClient;
  entity: "property" | "request";
  /** payload کامل (filingToProperty/potentialToRequest) */
  data: Record<string, unknown>;
  runId: string;
  /** زمان دادهٔ ورودی (live=now · bootstrap=زمان شاهد) */
  modifiedAt: Date;
  /** ثبت رد audit برای expert_override (پیش‌فرض true) */
  audit?: boolean;
}

export interface UpsertMergeResult {
  created: boolean;
  acceptedCount: number;
  rejectedCount: number;
  expertFields: string[];
  duplicateMerged: boolean;
}

/**
 * upsert دارای قانون — خواندن موجود → mergeRecord → نوشتن افزودنی.
 * هیچ‌وقت کل رکورد را بازنویسی نمی‌کند؛ فقط فیلدهای پذیرفته‌شده می‌نویسند.
 * رد audit expert_override: فقط نام فیلد + شناسه (قانون ۱۰ — صفر PII خام).
 */
export async function upsertRecordWithMerge(opts: UpsertMergeOpts): Promise<UpsertMergeResult> {
  const { db: defaultDb } = await import("@/lib/db");
  const client = opts.client ?? defaultDb;
  const auditOn = opts.audit !== false;
  const naturalKey = opts.entity === "property" ? "propertyCode" : "requestCode";
  const table = opts.entity === "property" ? client.propertyRecord : client.requestRecord;
  const tableAsPrisma = table as unknown as {
    findFirst(args: unknown): Promise<Record<string, unknown> | null>;
    create(args: unknown): Promise<unknown>;
    update(args: unknown): Promise<unknown>;
  };

  const existing = await tableAsPrisma.findFirst({
    where: { id: opts.data.id },
  });

  // مسیر P2002-قدیم: رکورد هم-کد با id متفاوت (سینک‌های نما-خصوصی PN-046)
  let duplicateMerged = false;
  let row = existing;
  if (!row) {
    const code = opts.data[naturalKey];
    if (code != null) {
      row = await tableAsPrisma.findFirst({ where: { [naturalKey]: code } });
      duplicateMerged = !!row;
    }
  }

  const merged = mergeRecord({
    entity: opts.entity,
    incoming: opts.data,
    existing: row,
    modifiedAt: opts.modifiedAt,
    runId: opts.runId,
  });

  const payload = stripProtectedNulls(merged.payload as Record<string, unknown>); // G1/G2 — دفاع در عمق

  if (merged.created) {
    try {
      await tableAsPrisma.create({ data: payload });
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code !== "P2002" || !row) throw e;
      // سبقت در مسابقه: بین findFirst و create رکورد ساخته شد → update ادغایی
      await tableAsPrisma.update({
        where: { [naturalKey]: opts.data[naturalKey] },
        data: payload,
      });
    }
  } else {
    // به‌روزرسانی همان ردیف موجود — id ردیف مبناست (هرگز id ورودی نوشته نمی‌شود)
    await tableAsPrisma.update({ where: { id: row!.id }, data: payload });
  }

  // رد حسابرسی expert_override — بدون مقدار خام (قانون ۱۰)
  if (auditOn && merged.expertFields.length > 0) {
    const { MELKETUN_TENANT_ID } = await import("@/lib/integrations/melketun/sync");
    const auditTable = (client as unknown as { auditLog: { create(args: unknown): Promise<unknown> } }).auditLog;
    for (const field of merged.expertFields) {
      try {
        await auditTable.create({
          data: {
            action: "expert_override",
            actor: "melketun-sync",
            operation: "WRITE",
            entityType: opts.entity === "property" ? "property" : "request",
            recordCount: 1,
            accessScope: "OWNER",
            tenantId: MELKETUN_TENANT_ID,
            detail: `field=${field} id=${String(opts.data.id)} runId=${opts.runId}`,
          },
        });
      } catch {
        // شکست audit سد عملیات نیست (Availability — §۶.۲)؛ provenance در رکورد ثبت شده است
      }
    }
  }

  return {
    created: merged.created,
    acceptedCount: merged.acceptedCount,
    rejectedCount: merged.rejectedCount,
    expertFields: merged.expertFields,
    duplicateMerged,
  };
}

// ─── بازگردانی (دستور ۴ — POST /api/records/{id}/revert) ────────────────────

export interface RevertOpts {
  client?: PrismaClient;
  entity: "property" | "request";
  id: string;
  field: string;
  actor?: string;
}

export type RevertOutcome =
  | { ok: true; revertedTo: unknown; change: FieldChangeEntry }
  | { ok: false; reason: "not_found" | "field_not_tracked" | "no_target" | "null_on_filled" };

/**
 * بازگردانی فیلد به مقدار پیش از آخرین تغییر پذیرفته‌شده.
 * هدف = from آخرین مدخل fieldChanges برای فیلد؛ در نبود آن، lastSyncedValue.
 * قانون دادهٔ مقدس: هدف null/تهی هرگز روی مقدار پر نمی‌نشیند → رد با دلیل.
 */
export async function revertRecordField(opts: RevertOpts): Promise<RevertOutcome> {
  const { db: defaultDb } = await import("@/lib/db");
  const client = opts.client ?? defaultDb;
  const table = opts.entity === "property" ? client.propertyRecord : client.requestRecord;
  const tableAsPrisma = table as unknown as {
    findFirst(args: unknown): Promise<Record<string, unknown> | null>;
    update(args: unknown): Promise<unknown>;
  };

  const row = await tableAsPrisma.findFirst({ where: { id: opts.id } });
  if (!row) return { ok: false, reason: "not_found" };

  const specs = opts.entity === "property" ? PROPERTY_FIELD_SPECS : REQUEST_FIELD_SPECS;
  if (!(opts.field in specs)) return { ok: false, reason: "field_not_tracked" };

  const changes = parseFieldChanges(row.fieldChanges);
  const prov = parseProvenanceMap(row.lastSyncedValue);
  const latest = [...changes].reverse().find((c) => c.field === opts.field);
  const target = latest ? latest.from : prov[opts.field]?.value ?? null;

  const current = normValue(row[opts.field]);
  const targetNorm = normValue(target);
  if (targetNorm === null) {
    if (current === null) return { ok: false, reason: "no_target" };
    return { ok: false, reason: "null_on_filled" }; // قانون ۰۴ — null روی پر ممنوع
  }
  if (current === targetNorm) {
    return { ok: false, reason: "no_target" }; // از پیش بازگردانی‌شده/بدون تغییر
  }

  const now = new Date();
  const entry: FieldChangeEntry = {
    field: opts.field,
    from: row[opts.field] ?? null,
    to: target,
    kind: "manual_revert",
    at: now.toISOString(),
    runId: `revert-${now.toISOString().slice(0, 19)}`,
  };
  const mergedChanges = [...changes, entry].slice(-FIELD_CHANGES_CAP);
  const provEntry: ProvenanceEntry = {
    value: target,
    source: SOURCE_OWNER,
    confidence: CONFIDENCE[SOURCE_OWNER],
    at: now.toISOString(),
  };

  await tableAsPrisma.update({
    where: { id: opts.id },
    data: stripProtectedNulls({
      [opts.field]: target,
      lastModifiedBy: SOURCE_OWNER,
      lastModifiedAt: now,
      lastSyncedValue: JSON.stringify({ ...prov, [opts.field]: provEntry }),
      fieldChanges: JSON.stringify(mergedChanges),
    } as Record<string, unknown>),
  });

  // رد audit manual_revert — بدون مقدار خام (قانون ۱۰)
  try {
    const { MELKETUN_TENANT_ID } = await import("@/lib/integrations/melketun/sync");
    const auditTable = (client as unknown as { auditLog: { create(args: unknown): Promise<unknown> } }).auditLog;
    await auditTable.create({
      data: {
        action: "manual_revert",
        actor: opts.actor ?? "owner",
        operation: "WRITE",
        entityType: opts.entity === "property" ? "property" : "request",
        recordCount: 1,
        accessScope: "OWNER",
        tenantId: MELKETUN_TENANT_ID,
        detail: `field=${opts.field} id=${opts.id}`,
      },
    });
  } catch {
    // شکست audit سد عملیات نیست (§۶.۲) — خود بازگردانی در رکورد ثبت شده است
  }

  return { ok: true, revertedTo: target, change: entry };
}
