"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import {
  PLAIN_RENDER_MAX,
  computeVirtualWindow,
} from "@/lib/virtual-window"

/*
 * قانون همیشگی فهرست‌ها (P6525 — دستور مالک ۱۴۰۵/۰۷/۰۵)
 * ------------------------------------------------------
 * این پریمیتیوها «منبع قانون» هستند؛ هر فهرستی (ایجادشده و قابل‌ایجاد در آینده)
 * که از Table/TableHeader/TableHead/TableRow/TableCell استفاده کند به‌طور خودکار
 * مطابق قانون فهرست است — با الگوی نمونهٔ عالی «فهرست معاملات»:
 *   ۱. تک‌صفحه‌ای — بدون صفحه‌بندی
 *   ۲. اسکرول سریع — ظرف اسکرول محدود (max-h) + content-visibility ردیف‌ها (cv-row)
 *   ۳. عنوان فهرست (سطر سرستون‌ها) ثابت و قابل‌رویت در زمان اسکرول — sticky
 *   ۴. بارگذاری سریع — تمام ردیف‌ها بدون هیچ محدودیتی (سقف فقط گارد ایمنی سرور است)
 *   ۵. وسط‌چین — سرستون‌ها و سلول‌ها text-center
 *   + اندازه فونت یکدست سلول‌ها: text-xs (الگوی فهرست معاملات)
 * لغو قانون فقط با className صریح ممکن است — که گارد تست P6525 آن را در فهرست‌ها می‌گیرد.
 *
 * P6527 — بند ۲ و ۴ قانون در فهرست‌های بسیار بزرگ (M1: ۱۱٬۳۹۸ ردیف / M2: ۷٬۳۱۴)
 * با رندر یکجای همهٔ ردیف‌ها نقض می‌شد: مرورگر موبایل هنگ می‌کرد (ریشهٔ
 * «لینک preview کار نمی‌کند» در اندروید). رفع دائمی بدون شکستن قانون:
 * «TableBodyVirtual» — همان tbody با هندسهٔ کامل (تمام ردیف‌ها در یک اسکرول،
 * ارتفاع کل = کل ردیف‌ها) اما فقط ردیف‌های قابل‌دیدن در DOM (~۴۰ + فاصله‌گذار).
 * فهرست‌های کوچک (تا PLAIN_RENDER_MAX) عین رفتار قبلی رندر می‌شوند.
 */

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div
      data-slot="table-container"
      className="relative w-full overflow-x-auto max-h-[32rem]"
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b sticky top-0 z-10 bg-card", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "bg-muted/50 border-t font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "cv-row hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "text-foreground h-10 px-2 text-center align-middle font-medium whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "p-2 text-center text-xs align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("text-muted-foreground mt-4 text-sm", className)}
      {...props}
    />
  )
}

/* ============================================================================
 * P6527 — TableBodyVirtual: بدنهٔ فهرست با رندر پنجره‌ای (قانون‌وفادار)
 * ============================================================================
 * جایگزین مستقیم <TableBody> برای هر فهرست:
 *
 *   <TableBodyVirtual rows={rows} rowKey={(r) => r.id}>
 *     {(r, i) => <TableRow key={r.id}>…</TableRow>}
 *   </TableBodyVirtual>
 *
 * • rows.length <= PLAIN_RENDER_MAX → عین TableBody امروز: همهٔ ردیف‌ها در DOM
 * • بزرگ‌تر → فقط ردیف‌های قابل‌دیدن + دو فاصله‌گذار؛ هندسهٔ اسکرول عین کل
 *   فهرست است (تک‌صفحه‌ای و تمام‌ردیفی طبق قانون؛ بدون صفحه‌بندی)
 * • ارتفاع ردیف‌ها اندازه‌گیری و کش می‌شود (ردیف‌های چندخطی هم درست کار می‌کنند)
 * • ظرف اسکرول = همان ظرف یگانهٔ قانون (data-slot="table-container") — سرستون
 *   sticky و text-xs و وسط‌چین همگی از همان پریمیتیوها می‌آیند (منبع قانون واحد)
 */

interface TableBodyVirtualProps<T> {
  rows: T[]
  /** کلید پایدار ردیف — پیشنهاد: (r) => r.id */
  rowKey?: (row: T, index: number) => string | number
  /** تابع رندر هر ردیف — باید <TableRow> برگرداند (با key) */
  children: (row: T, index: number) => React.ReactNode
  className?: string
}

function TableBodyVirtual<T>({
  rows,
  rowKey,
  children,
  className,
}: TableBodyVirtualProps<T>) {
  const tbodyRef = React.useRef<HTMLTableSectionElement | null>(null)
  const heightsRef = React.useRef<number[]>([])
  const [view, setView] = React.useState({ scrollTop: 0, viewportHeight: 0 })
  const [, bumpMeasure] = React.useReducer((x: number) => x + 1, 0)

  // useLayoutEffect روی سرور معنا ندارد — نسخهٔ ایمن SSR
  const useIsoLayoutEffect =
    typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect

  const virtual = rows.length > PLAIN_RENDER_MAX

  // اتصال به ظرف یگانهٔ اسکرول قانون + پیگیری اسکرول/اندازه (passive + rAF)
  React.useEffect(() => {
    if (!virtual) return
    const tbody = tbodyRef.current
    const container = (tbody?.closest(
      "[data-slot='table-container']",
    ) as HTMLDivElement | null) ?? null
    if (!container) return

    let raf = 0
    const readGeometry = () => {
      raf = 0
      setView((prev) => {
        const next = {
          scrollTop: container.scrollTop,
          viewportHeight: container.clientHeight,
        }
        return prev.scrollTop === next.scrollTop &&
          prev.viewportHeight === next.viewportHeight
          ? prev
          : next
      })
    }
    const onScroll = () => {
      if (raf === 0) raf = requestAnimationFrame(readGeometry)
    }
    container.addEventListener("scroll", onScroll, { passive: true })
    const ro = new ResizeObserver(onScroll)
    ro.observe(container)
    onScroll()
    return () => {
      container.removeEventListener("scroll", onScroll)
      ro.disconnect()
      if (raf !== 0) cancelAnimationFrame(raf)
    }
  }, [virtual])

  const win = React.useMemo(
    () =>
      computeVirtualWindow({
        count: rows.length,
        scrollTop: view.scrollTop,
        viewportHeight: view.viewportHeight,
        heights: heightsRef.current,
      }),
    [rows, view.scrollTop, view.viewportHeight],
  )

  // اندازه‌گیری ارتفاع واقعی ردیف‌های رندرشده (پس از هر رنگ‌آمیزیِ پنجره)
  useIsoLayoutEffect(() => {
    if (!virtual) return
    const tbody = tbodyRef.current
    if (!tbody) return
    const rendered = tbody.querySelectorAll<HTMLElement>("tr[data-vrow]")
    let changed = false
    rendered.forEach((tr) => {
      const idx = Number(tr.dataset.vrow)
      const h = tr.offsetHeight
      if (Number.isFinite(idx) && h > 0 && heightsRef.current[idx] !== h) {
        heightsRef.current[idx] = h
        changed = true
      }
    })
    if (changed) bumpMeasure()
  })

  if (!virtual) {
    return (
      <tbody
        ref={tbodyRef}
        data-slot="table-body"
        className={cn("[&_tr:last-child]:border-0", className)}
      >
        {rows.map((row, i) => children(row, i))}
      </tbody>
    )
  }

  const slice = rows.slice(win.start, win.end)
  return (
    <tbody
      ref={tbodyRef}
      data-slot="table-body"
      data-virtual="true"
      data-vtotal={rows.length}
      className={cn("[&_tr:last-child]:border-0", className)}
    >
      {win.topPad > 0 && (
        <tr aria-hidden data-vpad="top" style={{ height: win.topPad }}>
          <td style={{ padding: 0, border: 0, background: "transparent" }} />
        </tr>
      )}
      {slice.map((row, i) => {
        const index = win.start + i
        const node = children(row, index)
        const key = rowKey ? rowKey(row, index) : index
        return (
          <React.Fragment key={key}>
            {React.isValidElement(node)
              ? React.cloneElement(node as React.ReactElement<{ "data-vrow"?: number }>, {
                  "data-vrow": index,
                })
              : node}
          </React.Fragment>
        )
      })}
      {win.bottomPad > 0 && (
        <tr aria-hidden data-vpad="bottom" style={{ height: win.bottomPad }}>
          <td style={{ padding: 0, border: 0, background: "transparent" }} />
        </tr>
      )}
    </tbody>
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableBodyVirtual,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
