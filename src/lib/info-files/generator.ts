/**
 * Info File Generator — PN-045 · فاز ۳ (شورا-ن۰۸۹)
 * ---------------------------------------------------------------------------
 * «ستون اطلاعات = پنجره‌ای به دادهٔ خام» (بخش ۱ گزارش شورا):
 * هر کد (آگهی/درخواست/معامله/کارشناس) یک فایل متنی کامل دارد که هر سه لایه را
 * نشان می‌دهد: (۱) فیلدهای نرمال‌شده (۲) دادهٔ خام منبع (۳) متادیتای استخراج.
 *
 * تولید: lazy روی هر GET (خواندن یک رکورد + نوشتن فایل متنی) — بدون LLM،
 * بدون هزینه، بدون auto_execute. فایل هر بار تازه regenerate می‌شود تا
 * کهنگی ناممکن باشد (این فایل کاش/شاهد است، نه منبع حقیقت).
 *
 * مسیر: deliver-store/info/{tenant}/{type}-{code}.txt (gitignored — عین قانون
 * فایل v3/PN-014-D2). سرو فقط از مسیر احراز‌شدهٔ API — هرگز عمومی، چون
 * نام/موبایل مالک درون آن است.
 *
 * Doctrine: دادهٔ مقدس (صفر حذف/تغییر رکورد) · اصل ۱ پذیرش تفاوت:
 * مقدار تهی = «— (تهی)» نمایش داده می‌شود، نه صفر (صفر = دروغ).
 */

import fs from "fs";
import path from "path";
import { db } from "@/lib/db";
import { TENANT_DB_VALUES, type TenantKey } from "@/lib/tenants";

export type InfoType = "listing" | "request" | "transaction" | "expert";
export type InfoTenant = TenantKey; // 'tabriz' | 'melketun'

const INFO_ROOT = path.join(process.cwd(), "deliver-store", "info");

/** حداکثر طول بخش دادهٔ خام در فایل (بلاک فایل‌های نابهنجار غول‌پیکر) */
const RAW_SECTION_MAX = 64 * 1024;

export interface InfoFileResult {
  ok: boolean;
  /** محتوای متنی کامل فایل (همیشه برمی‌گردد — حتی اگر رکورد پیدا نشد، گزارش صادقانه) */
  content: string;
  /** مسیر نسبی فایل روی دیسک (شاهد) */
  filepath: string;
  /** رکورد پیدا شد؟ */
  found: boolean;
}

const TYPE_LABELS: Record<InfoType, string> = {
  listing: "آگهی",
  request: "درخواست",
  transaction: "معامله",
  expert: "کارشناس",
};

const TENANT_LABELS: Record<InfoTenant, string> = {
  tabriz: "ملک تبریز (ARM/PM — سامانهٔ داخلی)",
  melketun: "ملکتون (CRM — Laravel)",
};

/** تهی/خالی → «— (تهی)» — هرگز صفر (اصل ۱: صفر = دروغ) */
function val(v: unknown): string {
  if (v === null || v === undefined || v === "") return "— (تهی)";
  return String(v);
}

function dateVal(v: Date | string | null | undefined): string {
  if (!v) return "— (تهی)";
  try {
    return new Date(v as string | Date).toISOString();
  } catch {
    return "— (تهی)";
  }
}

/** JSON خام با سقف طول — پاراگراف صادقانه در صورت برش */
function rawSection(raw: unknown): string[] {
  const lines: string[] = [];
  if (raw === null || raw === undefined || raw === "") {
    lines.push("  (دادهٔ خامی برای این رکورد ذخیره نشده — رکورد قدیمی/داخلی)");
    return lines;
  }
  let pretty: string;
  try {
    pretty = typeof raw === "string" ? prettyJson(raw) : JSON.stringify(raw, null, 2);
  } catch {
    pretty = String(raw);
  }
  if (pretty.length > RAW_SECTION_MAX) {
    pretty = pretty.slice(0, RAW_SECTION_MAX) + "\n  … (برش خورده — سقف ۶۴KB بخش خام)";
  }
  lines.push(pretty);
  return lines;
}

/** detailsJson ممکن است رشتهٔ JSON باشد — با fallback صادقانه */
function prettyJson(s: string): string {
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s; // رشتهٔ خام — همان‌طور که هست
  }
}

// ── استخراج رکورد بر اساس نوع ─────────────────────────────────────────────
/* eslint-disable @typescript-eslint/no-explicit-any */
async function findRecord(tenant: InfoTenant, type: InfoType, code: string): Promise<any | null> {
  const tenantId = TENANT_DB_VALUES[tenant];
  switch (type) {
    case "listing":
      return db.propertyRecord.findFirst({
        where: { tenantId, propertyCode: code },
        orderBy: { updatedAt: "desc" },
      });
    case "request":
      return db.requestRecord.findFirst({
        where: { tenantId, requestCode: code },
        orderBy: { updatedAt: "desc" },
      });
    case "transaction":
      // معامله: کد = propertyCode قرارداد
      return db.transactionRecord.findFirst({
        where: { propertyCode: code },
        orderBy: { contractDate: "desc" },
      });
    case "expert":
      return db.expertRecord.findFirst({ where: { personnelCode: code } });
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** فیلدهای استاندارد هر نوع — برچسب فارسی + مقدار نرمال‌شده */
function standardFields(type: InfoType, r: Record<string, unknown>): [string, unknown][] {
  switch (type) {
    case "listing":
      return [
        ["کد آگهی", r.propertyCode],
        ["عنوان", r.title],
        ["وضعیت", r.status],
        ["نوع ملک", r.propertyTypeName],
        ["دسته‌بندی (نوع معامله)", r.tradeTypeName],
        ["منطقه", r.areaName],
        ["خط/محله", r.lineName],
        ["آدرس", r.address],
        ["قیمت (تومان)", r.price],
        ["قیمت هر متر (تومان)", r.pricePerMeter],
        ["پیش‌پرداخت / رهن (تومان)", r.depositPrice],
        ["اجاره (تومان)", r.rentPrice],
        ["متراژ", r.meterage],
        ["اتاق", r.rooms],
        ["طبقه", r.floor],
        ["سال ساخت", r.buildYear],
        /* PN-046/گام اول-۱ — قرارداد کاتالوگ M1: ownerName = کارشناس/آژانس، rawOwnerName = مالک واقعی.
           برای رکوردهای ملکتون (نگاشت v2) rawOwnerName مالک است؛ تبریز قدیمی بدون rawOwnerName → همان ownerName. */
        ["کارشناس / آژانس", r.ownerName],
        ["نام مالک", r.rawOwnerName ?? r.ownerName],
        ["موبایل مالک", r.ownerMobile],
        ["شعبه / آژانس مستقیم", r.armBranchTitle ?? r.branchId],
        ["شهر", r.cityName],
        ["استان", r.stateName],
        ["تعداد تصاویر", r.imageCount],
        ["یادداشت مالک", r.ownerNote],
        ["تاریخ ثبت", dateVal(r.createdAt as string | Date | null)],
        ["آخرین همگام‌سازی", dateVal(r.syncedAt as string | Date | null)],
      ];
    case "request":
      return [
        ["کد درخواست", r.requestCode],
        ["عنوان", r.title],
        ["نام درخواست‌دهنده", r.customerName],
        ["نوع ملک", r.propertyTypeName],
        ["نوع معامله", r.tradeTypeName],
        ["مناطق درخواستی", r.areaNamesJson ? prettyJson(String(r.areaNamesJson)) : null],
        ["قیمت از (تومان)", r.priceFrom],
        ["قیمت تا (تومان)", r.priceTo],
        /* PN-046/گام اول-۱ — بودجهٔ رهن/اجارهٔ ملکتون (§۱۴ افزودنی) */
        ["پیش‌پرداخت / بودجهٔ رهن (تومان)", r.depositBudget],
        ["بودجهٔ اجاره (تومان)", r.rentBudget],
        ["متراژ از", r.spaceFrom],
        ["متراژ تا", r.spaceTo],
        ["اتاق از", r.roomsFrom],
        ["اتاق تا", r.roomsTo],
        ["وضعیت", r.status],
        ["یادداشت مالک", r.ownerNote],
        ["تاریخ ثبت", dateVal(r.createdAt as string | Date | null)],
        ["آخرین به‌روزرسانی", dateVal(r.updatedAt as string | Date | null)],
      ];
    case "transaction":
      return [
        ["کد ملک قرارداد", r.propertyCode],
        ["کد درخواست", r.requestCode],
        ["فروشنده", r.propertyCustomer],
        ["خریدار", r.requestCustomer],
        ["شماره هولوگرام", r.contractHolo],
        ["تاریخ قرارداد", dateVal(r.contractDate as string | Date | null)],
        ["تعداد آگهی پیشنهادی", r.suggestedPropertyCount],
        ["تعداد رویدادها", r.eventsCount],
      ];
    case "expert":
      return [
        ["کد پرسنلی", r.personnelCode],
        ["نام کامل", r.fullName],
        ["موبایل", r.mobile],
        ["نقش", r.role],
        ["کسب‌وکار/آژانس", r.businessTitle],
      ];
  }
}

/** منبع دادهٔ خام هر نوع (لایهٔ ۱ حقیقت — عین منبع) */
function rawOf(type: InfoType, r: Record<string, unknown>): unknown {
  switch (type) {
    case "listing":
      return r.detailsJson ?? r.rawPrice ?? null;
    case "request":
      return r.inputsJson ?? null;
    case "transaction":
      return r.detailsJson ?? null;
    case "expert":
      return null; // کارشناس: تمام فیلدها استانداردند
  }
}

/**
 * تولید/بازتولید فایل اطلاعات یک کد — همیشه محتوا برمی‌گرداند.
 * اگر رکورد پیدا نشد، فایل «یافت نشد» صادقانه تولید می‌شود (گزارش صادقانه).
 */
export async function generateInfoFile(tenant: InfoTenant, type: InfoType, code: string): Promise<InfoFileResult> {
  const dir = path.join(INFO_ROOT, tenant);
  fs.mkdirSync(dir, { recursive: true });

  const filename = `${type}-${code}.txt`;
  const filepath = path.join(dir, filename);
  const relPath = `deliver-store/info/${tenant}/${filename}`;

  const record = await findRecord(tenant, type, code);

  const lines: string[] = [];
  lines.push("═".repeat(70));
  lines.push(`  اطلاعات کامل — ${TYPE_LABELS[type]} — ${code}`);
  lines.push(`  منبع: ${TENANT_LABELS[tenant]}`);
  lines.push(`  تولید: ${new Date().toISOString()} (lazy — هر بازخوانی تازه می‌شود)`);
  lines.push("═".repeat(70));
  lines.push("");

  if (!record) {
    lines.push("⚠️ رکوردی با این کد در این tenant پیدا نشد.");
    lines.push(`  tenant: ${tenant} · type: ${type} · code: ${code}`);
    lines.push("  اگر کد را از فهرست کپی کرده‌اید، ممکن است رکورد پس از آخرین sync حذف/تغییر کد شده باشد.");
    lines.push("");
    lines.push("═".repeat(70));
  } else {
    // بخش ۱ — فیلدهای استاندارد (نرمال‌شده)
    lines.push("─── بخش ۱ · فیلدهای استاندارد (نرمال‌شده) ───");
    for (const [label, v] of standardFields(type, record)) {
      lines.push(`  ${label}: ${val(v)}`);
    }
    lines.push("");

    // بخش ۲ — دادهٔ خام منبع (لایهٔ ۱ حقیقت — عین منبع، هرگز تغییر نمی‌کند)
    lines.push("─── بخش ۲ · دادهٔ خام منبع (عین منبع — بدون نرمال‌سازی) ───");
    lines.push(...rawSection(rawOf(type, record)));
    lines.push("");

    // بخش ۳ — متادیتای استخراج (provenance سه‌لایه P6.5-04-e-v2)
    lines.push("─── بخش ۳ · متادیتا ───");
    lines.push(`  tenant:              ${tenant} (DB: ${TENANT_DB_VALUES[tenant]})`);
    lines.push(`  type:                ${type}`);
    lines.push(`  شناسهٔ رکورد:        ${val(record.id)}`);
    lines.push(`  نسخهٔ منبع خام:      ${val(record.rawSourceVersion)}`);
    lines.push(`  زمان استخراج:        ${dateVal(record.extractedAt as string | Date | null)}`);
    lines.push(`  شناسهٔ دستهٔ استخراج: ${val(record.extractionBatchId)}`);
    lines.push(`  نسخهٔ نرمال‌سازی:     ${val(record.normalizationVersion)}`);
    lines.push(`  آخرین sync-run:      ${val(record.sourceRunId)}`);
    lines.push("");
    lines.push("═".repeat(70));
    lines.push("  پایان فایل اطلاعات — این فایل شاهد است، منبع حقیقت همان DB است");
    lines.push("═".repeat(70));
  }

  const content = lines.join("\n");
  fs.writeFileSync(filepath, content, "utf-8");
  return { ok: true, content, filepath: relPath, found: Boolean(record) };
}

/** اعتبارسنجی پارامترها — کد فقط [A-Za-z0-9_-] (ضد پیمایش مسیر) */
export function isValidInfoCode(code: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(code) && code.length <= 64;
}

export function isInfoType(v: string): v is InfoType {
  return v === "listing" || v === "request" || v === "transaction" || v === "expert";
}

export function isInfoTenant(v: string): v is InfoTenant {
  return v === "tabriz" || v === "melketun";
}
