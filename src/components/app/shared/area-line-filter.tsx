"use client";

/**
 * AreaLineFilter — DIR-MULTI-AREA-001 · فیلتر چندانتخابی مناطق و محله‌ها (گام اول)
 * ---------------------------------------------------------------------------
 * دستور مالک (۱۴۰۵/۰۸/۲۶): «در فیلتر فهرست آگهی و فهرست درخواست، بخش فیلتر
 * مناطق، امکان فیلتر چند محله ایجاد شود — بهترین حالت انطباق محله‌ها با
 * سامانه‌های ملک تبریز».
 *
 * · منبع گزینه‌ها عین رجیستری سامانه ARM ملک تبریز است (TABRIZ_AREAS:
 *   ۱۳۰ منطقه × ۹۲۶ محله با شناسه‌های رسمی آرم) — هیچ نامی خارج از رجیستری
 *   قابل انتخاب نیست ⇒ خروجی همیشه «منطبق بر سامانه مبدأ» است.
 * · انتخاب دو سطحی: «منطقه» = همهٔ محله‌های آن منطقه · «محله» = همان محله.
 *   دلالت: اجتماع (OR) — ردیفی که در هر یک از انتخاب‌ها بیفتد عبور می‌کند.
 * · جست‌وجوی نرمال‌شده (ارقام فارسی/عربی → لاتین · ي→ی · ك→ک — قانون P6525).
 * · صفر وابستگی سنگین: ترکیب‌باکس سبک (input + دراپ‌داون مطلق) — موبایل‌پسند.
 * · نام‌ها (نه شناسه‌ها) منتقل می‌شوند؛ نام‌های آرم در دیتابیس محلی عین
 *   نام‌های رجیستری‌اند (هر دو از خود سامانه ARM) ⇒ تطبیق دقیق سمت سرور.
 */

import { useMemo, useRef, useState } from "react";
import { MapPin, Search, X } from "lucide-react";
import { TABRIZ_AREAS, ALL_LINES } from "@/lib/divar/tabriz-locations";
import { normalizeFilterInput } from "@/lib/normalize-input";
import { faDigits } from "@/lib/jalali";

export interface AreaLineSelection {
  /** نام مناطق انتخابی (عین نام رسمی آرم) — هر منطقه یعنی همهٔ محله‌هایش */
  areas: string[];
  /** نام محله‌های انتخابی (عین نام رسمی آرم) */
  lines: string[];
}

interface AreaLineFilterProps {
  idPrefix: string;
  /** انتخاب جاری */
  selection: AreaLineSelection;
  /** تغییر انتخاب — همیشه آرایه‌های مرتب و بدون تکرار */
  onChange: (next: AreaLineSelection) => void;
  /** حداکثر گزینه نمایشی در دراپ‌داون (پیش‌فرض ۲۴) */
  maxSuggestions?: number;
}

/** نرمال‌سازی سبک برای جست‌وجو (نیم‌فاصله/فاصله هم‌ارز — عین normalizeFilterInput) */
function norm(s: string): string {
  return normalizeFilterInput(s).replace(/\s+/g, "");
}

interface Suggestion {
  kind: "area" | "line";
  name: string;
  /** نام منطقهٔ والد (برای محله‌ها) */
  areaName?: string;
  /** شمار محله‌های منطقه (برای مناطق) */
  lineCount?: number;
}

const SUGGEST_LIMIT_DEFAULT = 24;

export function AreaLineFilter({ idPrefix, selection, onChange, maxSuggestions = SUGGEST_LIMIT_DEFAULT }: AreaLineFilterProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listboxId = `${idPrefix}-area-line-listbox`;

  /** بستن دراپ‌داون با کلیک بیرون (بدون بستن با کلیک درون — انتخاب ادامه دارد) */
  const onRootBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (!rootRef.current?.contains(e.relatedTarget as Node)) setOpen(false);
  };

  const suggestions = useMemo<Suggestion[]>(() => {
    const q = norm(query);
    const out: Suggestion[] = [];
    // ۱) مناطق — همیشه نقطهٔ شروع (دانه‌درشت)
    for (const area of TABRIZ_AREAS) {
      if (q === "" || norm(area.n).includes(q)) {
        out.push({ kind: "area", name: area.n, lineCount: area.l.length });
      }
    }
    // ۲) محله‌ها — دانه‌ریز؛ نام تکراری بین مناطق فقط یک‌بار با نام منطقه
    const seen = new Set<string>();
    for (const line of ALL_LINES) {
      const key = norm(line.n);
      if (seen.has(key)) continue;
      if (q !== "" && !norm(line.n).includes(q) && !norm(line.areaName).includes(q)) continue;
      seen.add(key);
      out.push({ kind: "line", name: line.n, areaName: line.areaName });
    }
    // مناطق اول، سپس محله‌ها؛ هر دو به ترتیب رجیستری (ثابت و قابل پیش‌بینی)
    const areas = out.filter((s) => s.kind === "area");
    const lines = out.filter((s) => s.kind === "line");
    return [...areas, ...lines].slice(0, maxSuggestions);
  }, [query, maxSuggestions]);

  const selectedAreaSet = useMemo(() => new Set(selection.areas.map(norm)), [selection.areas]);
  const selectedLineSet = useMemo(() => new Set(selection.lines.map(norm)), [selection.lines]);

  const toggle = (s: Suggestion) => {
    if (s.kind === "area") {
      const next = selectedAreaSet.has(norm(s.name))
        ? selection.areas.filter((a) => a !== s.name)
        : [...selection.areas, s.name];
      onChange({ ...selection, areas: next });
    } else {
      const next = selectedLineSet.has(norm(s.name))
        ? selection.lines.filter((l) => l !== s.name)
        : [...selection.lines, s.name];
      onChange({ ...selection, lines: next });
    }
  };

  const removeArea = (name: string) => onChange({ ...selection, areas: selection.areas.filter((a) => a !== name) });
  const removeLine = (name: string) => onChange({ ...selection, lines: selection.lines.filter((l) => l !== name) });
  const clearAll = () => onChange({ areas: [], lines: [] });

  const activeCount = selection.areas.length + selection.lines.length;

  return (
    <div ref={rootRef} className="space-y-2" onBlur={onRootBlur} data-testid={`${idPrefix}-area-line-filter`}>
      {/* جست‌وجو + دراپ‌داون رجیستری آرم */}
      <div className="relative">
        <div className="relative">
          <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" aria-hidden />
          <input
            id={`${idPrefix}-area-line-search`}
            aria-controls={listboxId}
            aria-expanded={open}
            role="combobox"
            aria-autocomplete="list"
            autoComplete="off"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
              if (e.key === "Enter" && open && suggestions.length > 0) {
                e.preventDefault();
                toggle(suggestions[0]);
              }
            }}
            placeholder="جست‌وجوی منطقه یا محله… (نمونه: خاوران، ولیعصر)"
            className="w-full h-9 rounded-lg border border-input bg-background px-3 ps-8 text-xs font-bold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        {open && suggestions.length > 0 && (
          <ul
            id={listboxId}
            role="listbox"
            aria-label="مناطق و محله‌های سامانه ملک تبریز"
            className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-border bg-popover p-1 shadow-lg"
          >
            {suggestions.map((s) => {
              const active = s.kind === "area" ? selectedAreaSet.has(norm(s.name)) : selectedLineSet.has(norm(s.name));
              return (
                <li key={`${s.kind}-${s.name}`} role="option" aria-selected={active}>
                  <button
                    type="button"
                    onClick={() => toggle(s)}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-xs transition-colors ${
                      active ? "bg-primary/15 font-bold text-primary" : "hover:bg-accent"
                    }`}
                  >
                    <MapPin className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">
                      {s.name}
                      {s.kind === "area" ? (
                        <span className="text-[10px] text-muted-foreground"> — منطقه ({faDigits(String(s.lineCount ?? 0))} محله)</span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground"> — محله · منطقه {s.areaName}</span>
                      )}
                    </span>
                    {active ? <span className="text-[10px] font-bold text-primary shrink-0" aria-hidden>✓</span> : null}
                  </button>
                </li>
              );
            })}
            <li className="px-2 py-1 text-[10px] text-muted-foreground border-t border-border mt-1">
              عین رجیستری سامانه ملک تبریز — {faDigits(String(TABRIZ_AREAS.length))} منطقه و {faDigits(String(ALL_LINES.length))} محله
            </li>
          </ul>
        )}
      </div>

      {/* چیپ‌های انتخاب‌شده */}
      {activeCount > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5" data-testid={`${idPrefix}-area-line-chips`}>
          {selection.areas.map((a) => (
            <button
              key={`area-${a}`}
              type="button"
              onClick={() => removeArea(a)}
              title={`منطقه ${a} — همهٔ محله‌های این منطقه در فیلتر است (برای حذف کلیک کنید)`}
              className="inline-flex h-7 items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 text-[11px] font-bold text-primary sec-motion hover:bg-primary/20"
            >
              {a}
              <span className="text-[9px] opacity-70">(کل منطقه)</span>
              <X className="h-3 w-3" aria-hidden />
            </button>
          ))}
          {selection.lines.map((l) => (
            <button
              key={`line-${l}`}
              type="button"
              onClick={() => removeLine(l)}
              title={`محله ${l} (برای حذف کلیک کنید)`}
              className="inline-flex h-7 items-center gap-1 rounded-full border border-border bg-muted/60 px-2.5 text-[11px] font-bold sec-motion hover:bg-muted"
            >
              <MapPin className="h-3 w-3 text-muted-foreground" aria-hidden />
              {l}
              <X className="h-3 w-3" aria-hidden />
            </button>
          ))}
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
        <p className="text-[10px] text-muted-foreground" data-testid={`${idPrefix}-area-line-empty`}>
          فیلتر خاموش است — همهٔ تبریز. با انتخاب یک یا چند منطقه/محله، فهرست به اجتماع انتخاب‌ها محدود می‌شود.
        </p>
      )}
      <span className="sr-only" aria-live="polite">
        {activeCount > 0
          ? `${faDigits(String(selection.areas.length))} منطقه و ${faDigits(String(selection.lines.length))} محله انتخاب شده`
          : "هیچ منطقه یا محله‌ای انتخاب نشده"}
      </span>
    </div>
  );
}
