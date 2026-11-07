"use client";

/**
 * پنجرهٔ «فایل درخواست / فایل آگهی» — PN-028/رابعاً-الف/ب (دستور مالک)
 * ---------------------------------------------------------------------------
 * «با زدن این دکمه فایل کلیه اطلاعات کد درخواست/کد ملک پیشنهاد شده به صورت
 * حرفه‌ای آورده شود.»
 * پروندهٔ کامل و حرفه‌ای با شش بخش — همان زبان تحلیل چندوجهی کاشی تطبیق:
 * شناسنامه · مالی · مکانی · فیزیکی · انسانی · زمانی (+ فرم پویای ARM و توضیحات)
 */

import { useCallback, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Hash, Wallet, MapPin, Building2, UserRound, Clock, FileText, Loader2, Phone, Landmark, Ruler, BedDouble, Layers, CalendarDays, FileStack,
} from "lucide-react";
import { api } from "@/lib/client/api";
import { faDigits, faAmountFull, faDateTime } from "@/lib/format";
import { branchBadgeClass } from "@/lib/value-colors";
import { valueSoftClass } from "@/lib/value-colors";

/* ───────── انواع پرونده ───────── */

interface FileRow { label: string; value: string | null; dir?: "ltr" | "rtl" }
interface FileSection { key: string; title: string; icon: typeof Wallet; rows: FileRow[]; chips?: string[] }

interface ListingFile {
  ok: boolean;
  kind: "listing";
  code: string;
  identity: { title: string; code: string; listingTitle: string | null; status: string | null; owner: string | null; mobile: string | null };
  financial: { price: number | null; pricePerMeter: number | null; depositPrice: number | null; rentPrice: number | null; tradeType: string | null };
  spatial: { area: string | null; line: string | null; address: string | null; city: string | null };
  physical: { propertyType: string | null; meterage: number | null; rooms: number | null; floor: number | null; buildYear: number | null; imageCount: number | null };
  human: { expert: string | null; branch: string; expertCode: string | null };
  temporal: { createdAt: string | null; updatedAt: string | null; syncedAt: string | null; viewCount: number | null; addedToDivar: boolean | null; addedToInsta: boolean | null; isReposted: boolean | null };
  rawDetails: Array<{ label?: string; value?: string }>;
  description: string | null;
}

interface RequestFile {
  ok: boolean;
  kind: "request";
  code: string;
  identity: { title: string; code: string; requestTitle: string | null; status: string | null; customer: string | null; mobile: string | null };
  financial: { priceFrom: number | null; priceTo: number | null; tradeType: string | null; paymentMethod: string | null; deposit: number | null };
  spatial: { areas: string[]; lines: string[]; city: string | null; platform: string | null };
  physical: {
    propertyType: string | null; buildingType: string | null;
    spaceFrom: number | null; spaceTo: number | null;
    roomsFrom: number | null; roomsTo: number | null;
    floorFrom: number | null; floorTo: number | null;
    buildYearFrom: number | null; buildYearTo: number | null;
    documents: string[]; constructTypes: string[]; sides: string[]; exchange: string[];
  };
  human: { expert: string | null; branch: string; expertCode: string | null };
  temporal: { createdAt: string | null; updatedAt: string | null; registeredAt: string | null; urgent: boolean | null; seriousity: string | null; confirmSms: boolean | null };
  form: Array<{ label: string; value: string }>;
  customerDescription: string | null;
  realtorDescription: string | null;
}

type MatchFile = ListingFile | RequestFile;

/* ───────── رندر بخش‌ها ───────── */

function SectionRows({ rows }: { rows: FileRow[] }) {
  const visible = rows.filter((r) => r.value !== null && r.value !== undefined && r.value !== "" && !(Array.isArray(r.value) && r.value.length === 0));
  if (visible.length === 0) return <p className="text-[11px] text-muted-foreground">داده‌ای ثبت نشده است</p>;
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
      {visible.map((r) => (
        <div key={r.label} className="flex items-baseline justify-between gap-2 border-b border-dashed border-border/60 pb-1">
          <dt className="text-[11px] text-muted-foreground shrink-0">{r.label}:</dt>
          <dd className={`text-xs font-bold text-end ${r.dir === "ltr" ? "font-mono tabular-nums" : ""}`} dir={r.dir ?? "rtl"}>
            {r.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function SectionCard({ section }: { section: FileSection }) {
  const Icon = section.icon;
  return (
    <section className="rounded-xl border bg-card p-3 space-y-2">
      <h4 className="text-xs font-extrabold flex items-center gap-1.5 text-foreground">
        <Icon className="w-4 h-4 text-sec-m5-500" aria-hidden /> {section.title}
      </h4>
      <SectionRows rows={section.rows} />
      {section.chips && section.chips.length > 0 ? (
        <div className="flex flex-wrap gap-1 pt-1">
          {section.chips.map((c) => (
            <Badge key={c} variant="secondary" className="text-[10px] border-0">{c}</Badge>
          ))}
        </div>
      ) : null}
    </section>
  );
}

/* ───────── دیالوگ پرونده ───────── */

export function MatchFileSheet({
  open,
  onOpenChange,
  kind,
  code,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** request = فایل درخواست · listing = فایل آگهی */
  kind: "request" | "listing";
  code: string | null;
}) {
  const [file, setFile] = useState<MatchFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!code) return;
    setLoading(true);
    setFile(null);
    setError(null);
    try {
      const param = kind === "listing" ? `listingCode=${encodeURIComponent(code)}` : `requestCode=${encodeURIComponent(code)}`;
      const res = await api<MatchFile>(`/api/matching/file?${param}`);
      setFile(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطای نامشخص");
    } finally {
      setLoading(false);
    }
  }, [code, kind]);

  useEffect(() => {
    if (open && code) void load();
  }, [open, code, load]);

  const title = kind === "listing" ? `فایل آگهی ${faDigits(code ?? "")}` : `فایل درخواست ${faDigits(code ?? "")}`;

  const sections: FileSection[] = file
    ? file.kind === "listing"
      ? [
          {
            key: "identity", title: "شناسنامهٔ آگهی", icon: Hash,
            rows: [
              { label: "کد آگهی", value: faDigits(file.identity.code), dir: "ltr" },
              { label: "عنوان آگهی", value: file.identity.listingTitle },
              { label: "وضعیت", value: file.identity.status },
              { label: "مالک", value: file.identity.owner },
              { label: "موبایل مالک", value: file.identity.mobile ? faDigits(file.identity.mobile) : null, dir: "ltr" },
            ],
          },
          {
            key: "financial", title: "بخش مالی", icon: Wallet,
            rows: [
              { label: "دسته‌بندی معامله", value: file.financial.tradeType },
              { label: "قیمت ملک", value: file.financial.price != null ? `${faAmountFull(file.financial.price)} تومان` : null, dir: "ltr" },
              { label: "قیمت هر متر", value: file.financial.pricePerMeter != null ? `${faAmountFull(file.financial.pricePerMeter)} تومان` : null, dir: "ltr" },
              { label: "رهن", value: file.financial.depositPrice != null ? faAmountFull(file.financial.depositPrice) : null, dir: "ltr" },
              { label: "اجاره", value: file.financial.rentPrice != null ? faAmountFull(file.financial.rentPrice) : null, dir: "ltr" },
            ],
          },
          {
            key: "spatial", title: "بخش مکانی", icon: MapPin,
            rows: [
              { label: "منطقه", value: file.spatial.area },
              { label: "خط/کوی", value: file.spatial.line },
              { label: "آدرس کامل", value: file.spatial.address },
            ],
          },
          {
            key: "physical", title: "بخش فیزیکی", icon: Building2,
            rows: [
              { label: "نوع ملک", value: file.physical.propertyType },
              { label: "متراژ", value: file.physical.meterage != null ? `${faDigits(file.physical.meterage)} متر` : null, dir: "ltr" },
              { label: "اتاق", value: file.physical.rooms != null ? faDigits(file.physical.rooms) : null, dir: "ltr" },
              { label: "طبقه", value: file.physical.floor != null ? faDigits(file.physical.floor) : null, dir: "ltr" },
              { label: "سال ساخت", value: file.physical.buildYear != null ? faDigits(file.physical.buildYear) : null, dir: "ltr" },
              { label: "تعداد تصویر", value: file.physical.imageCount != null ? faDigits(file.physical.imageCount) : null, dir: "ltr" },
            ],
          },
          {
            key: "human", title: "بخش انسانی", icon: UserRound,
            rows: [
              { label: "کارشناس", value: file.human.expert },
              { label: "کد کارشناس", value: file.human.expertCode ? faDigits(file.human.expertCode) : null, dir: "ltr" },
            ],
            chips: [file.human.branch && file.human.branch !== "تعیین نشده" ? `شعبه: ${file.human.branch}` : "شعبه: تعیین نشده"],
          },
          {
            key: "temporal", title: "بخش زمانی و انتشار", icon: Clock,
            rows: [
              { label: "تاریخ ثبت", value: file.temporal.createdAt ? faDateTime(file.temporal.createdAt) : null },
              { label: "آخرین بروزرسانی", value: file.temporal.updatedAt ? faDateTime(file.temporal.updatedAt) : null },
              { label: "آخرین همگام‌سازی", value: file.temporal.syncedAt ? faDateTime(file.temporal.syncedAt) : null },
              { label: "بازدید", value: file.temporal.viewCount != null ? faDigits(file.temporal.viewCount) : null, dir: "ltr" },
              { label: "انتشار در دیوار", value: file.temporal.addedToDivar ? "منتشر شده" : null },
              { label: "انتشار در اینستاگرام", value: file.temporal.addedToInsta ? "منتشر شده" : null },
            ],
          },
        ]
      : [
          {
            key: "identity", title: "شناسنامهٔ درخواست", icon: Hash,
            rows: [
              { label: "کد درخواست", value: faDigits(file.identity.code), dir: "ltr" },
              { label: "عنوان درخواست", value: file.identity.requestTitle },
              { label: "وضعیت", value: file.identity.status },
              { label: "متقاضی", value: file.identity.customer },
              { label: "موبایل متقاضی", value: file.identity.mobile ? faDigits(file.identity.mobile) : null, dir: "ltr" },
            ],
          },
          {
            key: "financial", title: "بخش مالی", icon: Wallet,
            rows: [
              { label: "دسته‌بندی", value: file.financial.tradeType },
              { label: "قیمت از", value: file.financial.priceFrom != null ? `${faAmountFull(file.financial.priceFrom)} تومان` : null, dir: "ltr" },
              { label: "قیمت تا", value: file.financial.priceTo != null ? `${faAmountFull(file.financial.priceTo)} تومان` : null, dir: "ltr" },
              { label: "روش پرداخت", value: file.financial.paymentMethod },
            ],
          },
          {
            key: "spatial", title: "بخش مکانی", icon: MapPin,
            rows: [
              { label: "مناطق", value: file.spatial.areas.length > 0 ? file.spatial.areas.join("، ") : null },
              { label: "خط/کوی", value: file.spatial.lines.length > 0 ? file.spatial.lines.join("، ") : null },
              { label: "شهر", value: file.spatial.city },
              { label: "بستر ثبت", value: file.spatial.platform },
            ],
          },
          {
            key: "physical", title: "بخش فیزیکی", icon: Building2,
            rows: [
              { label: "نوع ملک", value: file.physical.propertyType },
              { label: "نوع ساختمان", value: file.physical.buildingType },
              { label: "متراژ", value: file.physical.spaceFrom != null || file.physical.spaceTo != null ? `${faDigits(file.physical.spaceFrom ?? "؟")} تا ${faDigits(file.physical.spaceTo ?? "؟")} متر` : null, dir: "ltr" },
              { label: "اتاق", value: file.physical.roomsFrom != null ? `${faDigits(file.physical.roomsFrom)} تا ${faDigits(file.physical.roomsTo ?? "؟")}` : null, dir: "ltr" },
              { label: "طبقه", value: file.physical.floorFrom != null ? `${faDigits(file.physical.floorFrom)} تا ${faDigits(file.physical.floorTo ?? "؟")}` : null, dir: "ltr" },
              { label: "ساخت", value: file.physical.buildYearFrom != null ? `${faDigits(file.physical.buildYearFrom)} تا ${faDigits(file.physical.buildYearTo ?? "؟")}` : null, dir: "ltr" },
              { label: "سند", value: file.physical.documents.length > 0 ? file.physical.documents.join("، ") : null },
              { label: "نوع ساخت", value: file.physical.constructTypes.length > 0 ? file.physical.constructTypes.join("، ") : null },
              { label: "جهت", value: file.physical.sides.length > 0 ? file.physical.sides.join("، ") : null },
              { label: "معاوضه", value: file.physical.exchange.length > 0 ? file.physical.exchange.join("، ") : null },
            ],
          },
          {
            key: "human", title: "بخش انسانی", icon: UserRound,
            rows: [
              { label: "کارشناس ثبت‌کننده", value: file.human.expert },
              { label: "کد کارشناس", value: file.human.expertCode ? faDigits(file.human.expertCode) : null, dir: "ltr" },
            ],
            chips: [file.human.branch && file.human.branch !== "تعیین نشده" ? `شعبه: ${file.human.branch}` : "شعبه: تعیین نشده"],
          },
          {
            key: "temporal", title: "بخش زمانی و جدیت", icon: Clock,
            rows: [
              { label: "تاریخ ثبت", value: file.temporal.createdAt ? faDateTime(file.temporal.createdAt) : null },
              { label: "آخرین بروزرسانی", value: file.temporal.updatedAt ? faDateTime(file.temporal.updatedAt) : null },
              { label: "ثبت سامانه ARM", value: file.temporal.registeredAt ? faDateTime(file.temporal.registeredAt) : null },
              { label: "فوریت", value: file.temporal.urgent ? "فوری" : null },
              { label: "جدیت متقاضی", value: file.temporal.seriousity },
              { label: "پیامک تأیید", value: file.temporal.confirmSms ? "فعال" : null },
            ],
          },
        ]
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 text-base">
            <FileText className="w-5 h-5 text-sec-m5-500" aria-hidden />
            {title}
            {file ? (
              <Badge variant="outline" className="text-[10px] gap-1">
                <Landmark className="w-3 h-3" aria-hidden /> {file.kind === "listing" ? "پروندهٔ آگهی ملک تبریز" : "پروندهٔ درخواست ملک تبریز"}
              </Badge>
            ) : null}
            {file?.kind === "request" && file.temporal.urgent ? (
              <Badge className="bg-rose-500 text-white text-[10px]">فوری</Badge>
            ) : null}
            {file?.human.branch && file.human.branch !== "تعیین نشده" ? (
              <Badge variant="outline" className={`text-[10px] border-0 ${branchBadgeClass(file.human.branch)}`} title="شعبهٔ کارشناس — از سامانهٔ PM">
                {file.human.branch}
              </Badge>
            ) : null}
          </DialogTitle>
          <DialogDescription>
            پروندهٔ کامل و حرفه‌ای — کلیهٔ اطلاعات سامانهٔ ملک تبریز برای این کد، در شش بخش دسته‌بندی‌شده (عین زبان تحلیل چندوجهی کاشی تطبیق).
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-xl border border-dashed p-6 text-center space-y-2">
            <p className="text-sm font-bold">پرونده ساخته نشد</p>
            <p className="text-xs text-muted-foreground">{error}</p>
          </div>
        ) : file ? (
          <div className="space-y-3">
            {/* هدر پرونده — تماس و کد */}
            <div className="rounded-xl border border-sec-m5-200 bg-sec-m5-50/60 p-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 border border-primary/20 px-2.5 py-1 font-extrabold text-primary text-xs" dir="ltr">
                <Hash className="w-3.5 h-3.5" aria-hidden /> {faDigits(file.code)}
              </span>
              {file.kind === "listing" && file.identity.mobile ? (
                <a href={`tel:${file.identity.mobile}`} dir="ltr" className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100">
                  <Phone className="w-3.5 h-3.5" aria-hidden /> {faDigits(file.identity.mobile)}
                </a>
              ) : null}
              {file.kind === "request" && file.identity.mobile ? (
                <a href={`tel:${file.identity.mobile}`} dir="ltr" className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100">
                  <Phone className="w-3.5 h-3.5" aria-hidden /> {faDigits(file.identity.mobile)}
                </a>
              ) : null}
              {file.kind === "listing" && file.physical.propertyType ? (
                <Badge variant="secondary" className={`text-[10px] border-0 ${valueSoftClass(file.physical.propertyType)}`}>
                  <Building2 className="w-3 h-3" aria-hidden /> {file.physical.propertyType}
                </Badge>
              ) : null}
              {file.kind === "request" && file.physical.propertyType ? (
                <Badge variant="secondary" className={`text-[10px] border-0 ${valueSoftClass(file.physical.propertyType)}`}>
                  <Building2 className="w-3 h-3" aria-hidden /> {file.physical.propertyType}
                </Badge>
              ) : null}
              {file.kind === "listing" && file.physical.meterage != null ? (
                <Badge variant="outline" className="text-[10px]"><Ruler className="w-3 h-3" aria-hidden /> {faDigits(file.physical.meterage)} متر</Badge>
              ) : null}
              {file.kind === "request" && file.physical.spaceFrom != null ? (
                <Badge variant="outline" className="text-[10px]"><Ruler className="w-3 h-3" aria-hidden /> {faDigits(file.physical.spaceFrom)}–{faDigits(file.physical.spaceTo ?? "؟")} متر</Badge>
              ) : null}
              {file.kind === "listing" && file.physical.rooms != null ? (
                <Badge variant="outline" className="text-[10px]"><BedDouble className="w-3 h-3" aria-hidden /> {faDigits(file.physical.rooms)} خواب</Badge>
              ) : null}
              {file.kind === "listing" && file.physical.floor != null ? (
                <Badge variant="outline" className="text-[10px]"><Layers className="w-3 h-3" aria-hidden /> طبقه {faDigits(file.physical.floor)}</Badge>
              ) : null}
              {file.kind === "listing" && file.physical.buildYear != null ? (
                <Badge variant="outline" className="text-[10px]"><CalendarDays className="w-3 h-3" aria-hidden /> ساخت {faDigits(file.physical.buildYear)}</Badge>
              ) : null}
              {file.kind === "request" && file.physical.buildYearFrom != null ? (
                <Badge variant="outline" className="text-[10px]"><CalendarDays className="w-3 h-3" aria-hidden /> ساخت {faDigits(file.physical.buildYearFrom)}–{faDigits(file.physical.buildYearTo ?? "؟")}</Badge>
              ) : null}
            </div>

            {/* شش بخش پرونده */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {sections.map((s) => (
                <SectionCard key={s.key} section={s} />
              ))}
            </div>

            {/* فرم پویای ARM (درخواست) */}
            {file.kind === "request" && file.form.length > 0 ? (
              <section className="rounded-xl border bg-card p-3 space-y-2">
                <h4 className="text-xs font-extrabold flex items-center gap-1.5">
                  <FileStack className="w-4 h-4 text-sec-m5-500" aria-hidden /> فرم ثبت درخواست (سامانه ARM)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1.5">
                  {file.form.map((f) => (
                    <div key={f.label} className="flex items-baseline justify-between gap-2 border-b border-dashed border-border/60 pb-1">
                      <span className="text-[11px] text-muted-foreground shrink-0">{f.label}:</span>
                      <span className="text-xs font-bold text-end">{f.value}</span>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {/* جزئیات خام آگهی (detailsJson) */}
            {file.kind === "listing" && file.rawDetails.length > 0 ? (
              <section className="rounded-xl border bg-card p-3 space-y-2">
                <h4 className="text-xs font-extrabold flex items-center gap-1.5">
                  <FileStack className="w-4 h-4 text-sec-m5-500" aria-hidden /> جزئیات ثبت آگهی (سامانه ARM)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1.5">
                  {file.rawDetails.map((d, i) => (
                    <div key={`${d.label ?? i}-${i}`} className="flex items-baseline justify-between gap-2 border-b border-dashed border-border/60 pb-1">
                      <span className="text-[11px] text-muted-foreground shrink-0">{d.label ?? "—"}</span>
                      <span className="text-xs font-bold text-end">{d.value ?? "—"}</span>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {/* توضیحات */}
            {file.kind === "listing" && file.description ? (
              <section className="rounded-xl border bg-muted/30 p-3 space-y-1">
                <h4 className="text-xs font-extrabold">توضیحات آگهی</h4>
                <p className="text-xs leading-6 text-muted-foreground whitespace-pre-wrap">{file.description}</p>
              </section>
            ) : null}
            {file.kind === "request" ? (
              <>
                {file.customerDescription ? (
                  <section className="rounded-xl border bg-muted/30 p-3 space-y-1">
                    <h4 className="text-xs font-extrabold">توضیحات متقاضی</h4>
                    <p className="text-xs leading-6 text-muted-foreground whitespace-pre-wrap">{file.customerDescription}</p>
                  </section>
                ) : null}
                {file.realtorDescription ? (
                  <section className="rounded-xl border bg-muted/30 p-3 space-y-1">
                    <h4 className="text-xs font-extrabold">یادداشت کارشناس</h4>
                    <p className="text-xs leading-6 text-muted-foreground whitespace-pre-wrap">{file.realtorDescription}</p>
                  </section>
                ) : null}
              </>
            ) : null}

            <Separator />
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Landmark className="w-3 h-3" aria-hidden />
              این پرونده از دادهٔ واقعی سامانه ملک تبریز (آخرین همگام‌سازی) ساخته شده است — منبع: کاشی {file.kind === "listing" ? "M1 آگهی" : "M2 درخواست"}.
            </p>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
