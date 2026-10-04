"use client";

/**
 * انتخاب‌گر تاریخ هجری شمسی (جلالی) — کاملاً فارسی و راست‌به‌چپ
 * ------------------------------------------------------
 * تقویم ماهانه با سربرگ روزهای هفته (شنبه تا جمعه)، ارقام فارسی،
 * ناوبری ماه/سال، دکمه «امروز» و پاک‌سازی. مقدار خارج‌شده همیشه
 * ISO ۸۶۰۱ (میلادی) است تا مستقیماً به API ارسال شود؛ نمایش همیشه
 * جلالی است. این کامپوننت جایگزین ورودی بومی میلادی است.
 */

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronRight, ChevronLeft, CalendarDays, X } from "lucide-react";
import {
  buildJalaliMonthGrid,
  dateToJalali,
  faDigits,
  formatJalaliLong,
  jalaliMonthLength,
  todayJalali,
  jalaliToDate,
} from "@/lib/jalali";

const MONTHS = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
];

export interface JalaliDatePickerProps {
  /** مقدار فعلی به‌صورت ISO (yyyy-mm-dd) یا رشته خالی */
  value: string;
  /** هنگام تغییر — مقدار ISO یا "" هنگام پاک‌سازی */
  onChange: (iso: string) => void;
  /** برچسب بالا (Label) */
  label?: string;
  id?: string;
  /**حداقل تاریخ ISO (اختیاری) */
  minIso?: string;
  /** حداکثر تاریخ ISO (اختیاری) */
  maxIso?: string;
  placeholder?: string;
  disabled?: boolean;
}

export function JalaliDatePicker({
  value,
  onChange,
  label,
  id,
  minIso,
  maxIso,
  placeholder = "انتخاب تاریخ",
  disabled = false,
}: JalaliDatePickerProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => {
    const j = value ? dateToJalali(new Date(value)) : todayJalali();
    return { jy: j.jy, jm: j.jm };
  });

  const selected = useMemo(() => {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : dateToJalali(d);
  }, [value]);

  const minJ = useMemo(() => (minIso ? dateToJalali(new Date(minIso)) : null), [minIso]);
  const maxJ = useMemo(() => (maxIso ? dateToJalali(new Date(maxIso)) : null), [maxIso]);

  const cells = useMemo(() => buildJalaliMonthGrid(view.jy, view.jm), [view]);

  const isDisabled = (cell: { jy: number; jm: number; jd: number }) => {
    if (minJ) {
      const c = cell.jy * 10000 + cell.jm * 100 + cell.jd;
      const m = minJ.jy * 10000 + minJ.jm * 100 + minJ.jd;
      if (c < m) return true;
    }
    if (maxJ) {
      const c = cell.jy * 10000 + cell.jm * 100 + cell.jd;
      const x = maxJ.jy * 10000 + maxJ.jm * 100 + maxJ.jd;
      if (c > x) return true;
    }
    return false;
  };

  const pick = (cell: { jy: number; jm: number; jd: number; date: Date }) => {
    if (isDisabled(cell)) return;
    // تاریخ را در زمان محلی ظهر ثبت می‌کنیم تا مرز روز جابه‌جا نشود
    const d = jalaliToDate(cell.jy, cell.jm, cell.jd);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    onChange(iso);
    setOpen(false);
  };

  const prevMonth = () => {
    setView((v) => (v.jm === 1 ? { jy: v.jy - 1, jm: 12 } : { jy: v.jy, jm: v.jm - 1 }));
  };
  const nextMonth = () => {
    setView((v) => (v.jm === 12 ? { jy: v.jy + 1, jm: 1 } : { jy: v.jy, jm: v.jm + 1 }));
  };
  const goToday = () => {
    const t = todayJalali();
    setView({ jy: t.jy, jm: t.jm });
    const d = jalaliToDate(t.jy, t.jm, t.jd);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    onChange(iso);
  };

  const monthTitle = `${MONTHS[view.jm - 1]} ${faDigits(view.jy)}`;

  return (
    <div className="space-y-1.5">
      {label && (
        <button
          type="button"
          className="text-sm font-medium leading-none block text-right"
          onClick={() => setOpen(true)}
        >
          {label}
        </button>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            id={id}
            disabled={disabled}
            className="flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-input bg-background px-3 py-2 text-sm text-right font-normal shadow-xs transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="flex items-center gap-2 truncate">
              <CalendarDays className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden />
              {selected ? formatJalaliLong(selected) : <span className="text-muted-foreground">{placeholder}</span>}
            </span>
            {value && (
              <span
                role="button"
                tabIndex={0}
                aria-label="پاک‌کردن تاریخ"
                className="shrink-0 rounded-md p-0.5 text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    onChange("");
                  }
                }}
              >
                <X className="w-3.5 h-3.5" aria-hidden />
              </span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start" dir="rtl">
          <div className="w-[17.5rem] p-3">
            {/* ناوبری ماه */}
            <div className="flex items-center justify-between mb-2">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={nextMonth} aria-label="ماه بعد">
                <ChevronLeft className="w-4 h-4" aria-hidden />
              </Button>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="text-sm font-bold rounded-md px-2 py-1 hover:bg-accent"
                  onClick={() => setView((v) => ({ ...v, jy: v.jy + 1 }))}
                  aria-label="سال بعد"
                >
                  {monthTitle}
                </button>
                <button
                  type="button"
                  className="text-[10px] text-muted-foreground rounded-md px-1 py-1 hover:bg-accent"
                  onClick={() => setView((v) => ({ ...v, jy: v.jy - 1 }))}
                  aria-label="سال قبل"
                  title="سال قبل"
                >
                  ▾
                </button>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={prevMonth} aria-label="ماه قبل">
                <ChevronRight className="w-4 h-4" aria-hidden />
              </Button>
            </div>

            {/* سربرگ روزهای هفته — شنبه تا جمعه */}
            <div className="grid grid-cols-7 mb-1">
              {["ش", "ی", "د", "س", "چ", "پ", "ج"].map((w, i) => (
                <div
                  key={w}
                  className={`text-center text-[11px] font-medium py-1 ${i === 6 ? "text-rose-500" : "text-muted-foreground"}`}
                >
                  {w}
                </div>
              ))}
            </div>

            {/* شبکه روزها */}
            <div className="grid grid-cols-7 gap-0.5">
              {cells.map((cell, i) => {
                const key = `${cell.jd}-${i}`;
                const inView = cell.inMonth;
                const isSelected =
                  selected !== null &&
                  inView &&
                  selected.jy === view.jy &&
                  selected.jm === view.jm &&
                  selected.jd === cell.jd;
                const disabledCell = !inView || isDisabled({ jy: view.jy, jm: view.jm, jd: cell.jd });
                return (
                  <button
                    type="button"
                    key={key}
                    disabled={disabledCell}
                    onClick={() => pick({ jy: view.jy, jm: view.jm, jd: cell.jd, date: cell.date })}
                    className={[
                      "h-8 w-8 text-xs rounded-lg transition-colors",
                      inView ? "" : "opacity-25",
                      isSelected
                        ? "bg-primary text-primary-foreground font-bold"
                        : cell.isToday
                          ? "border border-primary/60 text-primary font-bold"
                          : "hover:bg-accent",
                      disabledCell ? "cursor-not-allowed opacity-30" : "",
                      i % 7 === 6 && !isSelected ? "text-rose-500" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    aria-label={inView ? `${faDigits(cell.jd)} ${MONTHS[view.jm - 1]}` : undefined}
                    aria-current={cell.isToday ? "date" : undefined}
                    aria-pressed={isSelected}
                  >
                    {faDigits(cell.jd)}
                  </button>
                );
              })}
            </div>

            {/* پایین تقویم */}
            <div className="flex items-center justify-between pt-2 mt-1 border-t">
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={goToday}>
                امروز
              </Button>
              <span className="text-[11px] text-muted-foreground">
                {faDigits(jalaliMonthLength(view.jy, view.jm))} روز
              </span>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
