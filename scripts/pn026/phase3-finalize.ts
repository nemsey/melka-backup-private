#!/usr/bin/env bun
/** PN-026 · فاز ۳ — نهایی‌سازی لیست اضافات با راستی‌آزمایی کامل */
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const prev = JSON.parse(readFileSync("/home/z/my-project/download/pn026/dead-code-list.json", "utf8"));
const ep = JSON.parse(readFileSync("/tmp/pn026-endpoints.json", "utf8"));

const pkg = JSON.parse(readFileSync("/home/z/my-project/package.json", "utf8"));
// وابستگی‌های راستی‌آزمایی‌شدهٔ بی‌استفاده (صفر import در src+tests+scripts؛ prisma=CLI نگه؛ tw-animate از tw-animate-css می‌آید نه این پکیج)
const verifiedUnusedDeps = [
  "@dnd-kit/core", "@dnd-kit/sortable", "@dnd-kit/utilities", "@hookform/resolvers", "@mdxeditor/editor",
  "@radix-ui/react-aspect-ratio", "@radix-ui/react-context-menu", "@radix-ui/react-hover-card", "@radix-ui/react-menubar",
  "@radix-ui/react-navigation-menu", "@radix-ui/react-toggle-group", "@reactuses/core", "@tanstack/react-query",
  "@tanstack/react-table", "cmdk", "date-fns", "next-auth", "next-intl", "react-day-picker", "react-markdown",
  "react-resizable-panels", "react-syntax-highlighter", "sonner", "uuid", "vaul", "zod",
].filter((d) => (pkg.dependencies ?? {})[d]);
const keptButSuspicious = [
  { dep: "prisma", why: "CLI در اسکریپت‌های package.json — نگه" },
  { dep: "sharp", why: "بهینه‌سازی تصویر Next — نگه (safe)" },
  { dep: "tailwindcss-animate", why: "globals.css از tw-animate-css جدا استفاده می‌کند — این پکیج شاید زائد باشد (کاندید ریز)" },
];

const finalList = {
  phase: "فاز ۳ — لیست اضافات (فقط شناسایی · صفر حذف)",
  rule: "قاعدهٔ ۶ — تصمیم با مالک",
  scanned: prev.scanned,
  verified: {
    endpointsTrulyUnused: {
      count: ep.trulyUnused.length,
      items: ep.trulyUnused.map((r: string) => ({
        route: r,
        review: r === "/gap/connection" ? "دستور جلسهٔ ۰۳۳ مالک: gapApi پابرجا ماند — تصمیم مالک" :
          r.startsWith("/crm/finance") ? "کاشی مالی ادغام‌شده در معاملات (P6.5-11) — داده ماندگار" :
          r === "/crm/customer-club" ? "کاشی حذف‌نما (P6.5-12) — داده ماندگار" :
          r === "/crm/branches" ? "گزینه‌های شعبه از filterOptions پاسخ فهرست‌ها می‌آید — این روت احتمالاً زائد" :
          r.startsWith("/admin/model-versions") ? "پنل قهرمان/چلنجر — نگه‌داری برای UI آینده یا حذف با تأیید" :
          r === "/melk-public/sync" ? "همگام‌سازی عمومی — بازبینی کاربرد خارجی" :
          "بازبینی پیش از هر تصمیم",
      })),
      note: "۳۲ روت غیر-ارجاع در src؛ ۲۰ تا از آن‌ها در Worker/اسکریپت‌ها زنده‌اند؛ ۱۰۰ آینهٔ v1 عمداً زنده‌اند (مانیفست v1 — نه کد مرده)",
    },
    modulesUnused: {
      count: 4,
      items: ["src/components/ui/toggle.tsx", "src/components/ui/form.tsx", "src/components/ui/scroll-area.tsx", "src/components/ui/chart.tsx"],
      note: "پیش‌فرض‌های shadcn/ui — صفر import در کل مخزن؛ بقیهٔ «کاندیدهای» قبلی در تست‌ها/گاردها زنده‌اند (visits-agent · fa-sort · cross-tile · palette13 · smart-update) — رد شدند",
    },
    tablesAbandoned: {
      count: 1,
      items: ["SyncDeadLetter (صفر ردیف — صف نامه‌های مردهٔ sync؛ مدل زنده برای خطاهای آینده)"],
      note: "۱۳ جدول دیگر خالی اما ارجاع‌شده (InteractionRecord · CustomerRecord · PersonnelAccess · …) — آمادهٔ دادهٔ آینده — طبق قانون دادهٔ مقدس همه می‌مانند",
    },
    depsUnused: { count: verifiedUnusedDeps.length, items: verifiedUnusedDeps, note: "راستی‌آزمایی: صفر import در src+tests+scripts · prisma/sharp نگه" },
    legacyDirs: {
      count: 3,
      items: [
        "src/core/tiles/tiles/customer-club/ (حذف‌نما از bootstrap — پوشه مانده)",
        "src/core/tiles/tiles/listing + request (کاشی‌های میراثی — در bootstrap زنده‌اند اما با arm-listing/arm-request هم‌پوشان)",
      ],
      note: "ایجنت‌ها و دادهٔ این کاشی‌ها ماندگارند (قانون دادهٔ مقدس) — تصمیم حذف نمای UI با مالک",
    },
    historicalScripts: { count: 404, note: "اسکریپت‌های تأیید/تحویل تاریخی (pn0*, p65*, verify-*) — اسناد زندهٔ ممیزی؛ حذف برخی ممکن با تأیید مالک" },
    tmpBigLogsOldBackups: { tmp: 0, logsOver10MB: 0, backupsOver30d: 0, note: "چرخش لاگ و هرس نسل‌ها فعال و مؤثر" },
  },
  sizeEstimate: {
    depsMB: 0,
    note: "حدود ۲۶ dependency بی‌استفاده ≈ بخشی از node_modules (~۱۵-۴۰MB نصب) — اثر بر بیلد تولید تقریباً صفر (tree-shaking) — سود اصلی: سلامت manifest",
  },
  decisionForm: "فرم درخواست مجوز فاز ۶ (حذف) — نیازمند تأیید صریح مالک برای هر قلم",
};

writeFileSync("/home/z/my-project/download/pn026/dead-code-list.json", JSON.stringify(finalList, null, 1));
console.log("✓ dead-code-list.json نهایی شد");
console.log(JSON.stringify({ endpoints: ep.trulyUnused.length, modules: 4, deps: verifiedUnusedDeps.length, tables: 1, historicalScripts: 404 }, null, 1));
