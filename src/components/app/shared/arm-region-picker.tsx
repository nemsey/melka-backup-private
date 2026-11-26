"use client";

/**
 * ArmRegionPicker — DIR-OWNER-4STEPS-001 (گام سوم · دستور مالک ۱۴۰۵/۰۹/۰۵)
 * ---------------------------------------------------------------------------
 * «جستجوی مناطق و محله‌ها» دقیقاً همانند و منطبق با بخش مناطق در ثبت آگهی جدید
 * در سامانه ARM ملک تبریز — عین الگوی فرم ثبت آگهی آرم (NewListingDialog · گام ۲):
 *
 *   · «منطقه (منطقه‌بندی آرم)» — دراپ‌داون همهٔ مناطق رجیستری آرم (ترتیب رجیستری)
 *   · «محله» — دراپ‌داون محله‌های همان منطقهٔ انتخابی (تا پیش از انتخاب منطقه غیرفعال)
 *   · منبع یگانه: TABRIZ_AREAS / ALL_LINES — همان رجیستری رسمی ثبت آگهی آرم
 *     (۱۳۰ منطقه × ۹۲۶ محله با شناسه‌های رسمی آرم) — هیچ نامی بیرون رجیستری نیست.
 *
 * مصرف‌کننده‌ها (هر دو به یک کامپوننت — تضمین «دقیقاً همانند» بودن دو مکان):
 *   · «تنظیمات اختصاصی ایجنت فایل‌یابی» → بخش «جستجوی مناطق و محله‌ها»
 *   · فیلتر فهرست‌های چهارگانه (area-line-filter.tsx سازگار می‌شود)
 *
 * چون این کامپوننت در زمینهٔ فیلتر چندانتخابی نشسته است، هر انتخاب در سبد
 * انباشته می‌شود و با چیپ‌های قابل‌حذف نمایش داده می‌شود — ساختار انتخاب
 * (منطقه → محله‌های همان منطقه) عین ساختار بخش مناطق ثبت آگهی آرم است:
 *   · انتخاب یک منطقه = کل آن منطقه (عین تیک «کل منطقه» در ARM)
 *   · انتخاب محله پس از انتخاب منطقه = همان محله از فهرست محله‌های آن منطقه
 */

import { useMemo, useState } from "react";
import { MapPin, X } from "lucide-react";
import { TABRIZ_AREAS, findLine } from "@/lib/divar/tabriz-locations";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { faDigits } from "@/lib/jalali";

export interface ArmRegionSelection {
  /** شناسه‌های رسمی مناطق انتخابی در رجیستری آرم */
  areaIds: string[];
  /** شناسه‌های رسمی محله‌های انتخابی در رجیستری آرم */
  lineIds: string[];
}

interface ArmRegionPickerProps {
  /** پیشوند شناسه‌های aria/test — یکتا در هر صفحه */
  idPrefix: string;
  /** انتخاب جاری */
  selection: ArmRegionSelection;
  /** تغییر انتخاب — همیشه آرایه‌های بدون تکرار و مرتب به ترتیب رجیستری */
  onChange: (next: ArmRegionSelection) => void;
}

const AREA_BY_ID = new Map(TABRIZ_AREAS.map((a) => [a.id, a] as const));
/** ترتیب رجیستری: هر محله = (ترتیب منطقهٔ مادر، ترتیب درون منطقه) */
const LINE_ORDER = new Map(
  TABRIZ_AREAS.flatMap((a, ai) => a.l.map((l, li) => [l.id, { area: ai, self: li }] as const))
);
const AREA_ORDER = new Map(TABRIZ_AREAS.map((a, i) => [a.id, i] as const));

/** ترتیب رجیستری — خروجی همیشه به ترتیب رجیستری آرم (ثابت و قابل پیش‌بینی) */
function registrySort(ids: string[]): string[] {
  return [...new Set(ids)].sort((a, b) => {
    const ia = AREA_ORDER.get(a);
    const ib = AREA_ORDER.get(b);
    if (ia != null || ib != null) return (ia ?? Infinity) - (ib ?? Infinity); // مناطق به ترتیب رجیستری
    const ra = LINE_ORDER.get(a) ?? { area: Infinity, self: 0 };
    const rb = LINE_ORDER.get(b) ?? { area: Infinity, self: 0 };
    return ra.area === rb.area ? ra.self - rb.self : ra.area - rb.area; // محله‌های منطقهٔ مادر، به ترتیب رجیستری
  });
}

export function ArmRegionPicker({ idPrefix, selection, onChange }: ArmRegionPickerProps) {
  /** منطقهٔ جاری — همان «منطقهٔ انتخاب‌شده در فرم ثبت آگهی آرم» (تا محله‌هایش نمایان شوند) */
  const [currentAreaId, setCurrentAreaId] = useState<string>("");
  /** آخرین محلهٔ برداشته‌شده از دراپ‌داون (سبد انباشته — چیپ‌ها سبدهای واقعی‌اند) */
  const [lastLineId, setLastLineId] = useState<string>("");

  const currentArea = currentAreaId ? AREA_BY_ID.get(currentAreaId) ?? null : null;

  const areaIds = useMemo(() => registrySort(selection.areaIds), [selection.areaIds]);
  const lineIds = useMemo(() => registrySort(selection.lineIds), [selection.lineIds]);

  /** انتخاب منطقه — عین فرم آرم: منطقه سوار می‌شود و محله‌هایش در دسترس می‌شود.
   * در زمینهٔ فیلتر، کل منطقه نیز به سبد اضافه می‌شود (چیپ قابل حذف). */
  const onPickArea = (areaId: string) => {
    setCurrentAreaId(areaId);
    if (areaId && !selection.areaIds.includes(areaId)) {
      const area = AREA_BY_ID.get(areaId);
      // محله‌های زائد همان منطقه (کل منطقه مقدم است) حذف می‌شوند — عین منطق قبلی
      const areaLineIds = new Set(area?.l.map((l) => l.id) ?? []);
      onChange({
        areaIds: registrySort([...selection.areaIds, areaId]),
        lineIds: selection.lineIds.filter((id) => !areaLineIds.has(id)),
      });
    }
  };

  /** انتخاب محله — عین فرم آرم: از فهرست محله‌های همان منطقه؛ به سبد اضافه می‌شود */
  const onPickLine = (lineId: string) => {
    setLastLineId(lineId);
    const line = findLine(lineId);
    if (line && !selection.lineIds.includes(lineId) && !selection.areaIds.includes(line.areaId)) {
      onChange({ areaIds: selection.areaIds, lineIds: registrySort([...selection.lineIds, lineId]) });
    }
  };

  const removeArea = (areaId: string) => {
    onChange({ areaIds: selection.areaIds.filter((a) => a !== areaId), lineIds: selection.lineIds });
    if (currentAreaId === areaId) setCurrentAreaId("");
  };

  const removeLine = (lineId: string) => {
    onChange({ areaIds: selection.areaIds, lineIds: selection.lineIds.filter((l) => l !== lineId) });
    if (lastLineId === lineId) setLastLineId("");
  };

  const clearAll = () => onChange({ areaIds: [], lineIds: [] });
  const activeCount = areaIds.length + lineIds.length;

  return (
    <div className="space-y-2" data-testid={`${idPrefix}-arm-region-picker`}>
      {/* عین بخش مناطق ثبت آگهی جدید سامانه ARM — دو دراپ‌داون وابسته */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor={`${idPrefix}-arm-area`} className="text-xs">
            منطقه (منطقه‌بندی آرم)
          </label>
          <Select value={currentAreaId || undefined} onValueChange={onPickArea}>
            <SelectTrigger id={`${idPrefix}-arm-area`} className="text-xs" aria-label="انتخاب منطقه">
              <SelectValue placeholder="انتخاب کنید" />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              {TABRIZ_AREAS.map((a) => (
                <SelectItem key={a.id} value={a.id} className="text-xs">
                  {a.n}
                  {selection.areaIds.includes(a.id) ? " ✓" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${idPrefix}-arm-line`} className="text-xs">
            محله
          </label>
          <Select value={lastLineId || undefined} onValueChange={onPickLine} disabled={!currentArea}>
            <SelectTrigger id={`${idPrefix}-arm-line`} className="text-xs" aria-label="انتخاب محله">
              <SelectValue placeholder={currentArea ? "انتخاب کنید" : "ابتدا منطقه را انتخاب کنید"} />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              {(currentArea?.l ?? []).map((l) => (
                <SelectItem key={l.id} value={l.id} className="text-xs" disabled={selection.areaIds.includes(currentAreaId)}>
                  {l.n}
                  {selection.lineIds.includes(l.id) ? " ✓" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground leading-relaxed">
        عین بخش مناطق ثبت آگهی جدید سامانه ARM ملک تبریز — {faDigits(String(TABRIZ_AREAS.length))} منطقه و {faDigits(String(TABRIZ_AREAS.reduce((s, a) => s + a.l.length, 0)))} محله از رجیستری رسمی آرم؛ ابتدا منطقه، سپس محله‌های همان منطقه.
      </p>

      {/* چیپ‌های انتخاب‌شده — سبد انباشتهٔ فیلتر (حذف تکی/کلی) */}
      {activeCount > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5" data-testid={`${idPrefix}-arm-region-chips`}>
          {areaIds.map((id) => {
            const name = AREA_BY_ID.get(id)?.n ?? id;
            return (
              <button
                key={`area-${id}`}
                type="button"
                onClick={() => removeArea(id)}
                title={`منطقه ${name} — همهٔ محله‌های این منطقه در فیلتر است (برای حذف کلیک کنید)`}
                className="inline-flex h-7 items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 text-[11px] font-bold text-primary sec-motion hover:bg-primary/20"
              >
                {name}
                <span className="text-[9px] opacity-70">(کل منطقه)</span>
                <X className="h-3 w-3" aria-hidden />
              </button>
            );
          })}
          {lineIds.map((id) => {
            const line = findLine(id);
            return (
              <button
                key={`line-${id}`}
                type="button"
                onClick={() => removeLine(id)}
                title={`محله ${line?.n ?? id} (برای حذف کلیک کنید)`}
                className="inline-flex h-7 items-center gap-1 rounded-full border border-border bg-muted/60 px-2.5 text-[11px] font-bold sec-motion hover:bg-muted"
              >
                <MapPin className="h-3 w-3 text-muted-foreground" aria-hidden />
                {line?.n ?? id}
                {line ? <span className="text-[9px] text-muted-foreground">· {line.areaName}</span> : null}
                <X className="h-3 w-3" aria-hidden />
              </button>
            );
          })}
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-border px-2.5 text-[10px] text-muted-foreground sec-motion hover:bg-accent"
            aria-label="پاک کردن فیلتر مناطق و محله‌ها"
          >
            <X className="h-3 w-3" aria-hidden /> پاک کردن همه
          </button>
        </div>
      ) : (
        <p className="text-[10px] text-muted-foreground" data-testid={`${idPrefix}-arm-region-empty`}>
          فیلتر خاموش است — همهٔ تبریز. با انتخاب یک یا چند منطقه/محله، فهرست به اجتماع انتخاب‌ها محدود می‌شود.
        </p>
      )}
      <span className="sr-only" aria-live="polite">
        {activeCount > 0
          ? `${faDigits(String(areaIds.length))} منطقه و ${faDigits(String(lineIds.length))} محله انتخاب شده`
          : "هیچ منطقه یا محله‌ای انتخاب نشده"}
      </span>
    </div>
  );
}
