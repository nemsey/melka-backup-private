"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

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

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
