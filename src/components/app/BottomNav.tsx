"use client";

/**
 * BottomNav — ناوبری پایین ۵آیتمی (قانون ظاهر فاخر ۰۳۵-B — بخش ج/۳)
 * ------------------------------------------------------------------
 * • ۵ آیتم: هوم · فایل‌یابی · آگهی ملکا · درخواست ملکا · تنظیمات
 * • فقط موبایل (md:hidden) — دسکتاپ از کاشی‌های هوم استفاده می‌کند.
 * • رنگ فعال = رنگ اختصاصی همان بخش (نظام رنگ ۱۳گانه) · Ripple + Haptic.
 * • Safe-area (نوار iOS) · اندازهٔ تاچ ≥ ۴۴px · ARIA (nav + aria-current).
 */

import { Home, FileSearch, ClipboardList, ClipboardPlus, Settings2 } from "lucide-react";
import { useAppStore } from "@/lib/client/store";
import { haptic } from "@/lib/haptics";
import type { LucideIcon } from "lucide-react";

const ITEMS: { id: string | null; label: string; icon: LucideIcon; activeClass: string }[] = [
  { id: null, label: "هوم", icon: Home, activeClass: "text-sec-home-700 dark:text-sec-home-700" },
  { id: "file-finder", label: "فایل‌یابی", icon: FileSearch, activeClass: "text-sec-finder-700" },
  { id: "listings", label: "آگهی ملکا", icon: ClipboardList, activeClass: "text-sec-melka-listing-700" },
  { id: "requests", label: "درخواست ملکا", icon: ClipboardPlus, activeClass: "text-sec-melka-request-700" },
  { id: "settings", label: "تنظیمات", icon: Settings2, activeClass: "text-sec-settings-700" },
];

export function BottomNav() {
  const activeTileId = useAppStore((s) => s.activeTileId);
  const stage = useAppStore((s) => s.stage);
  const openTile = useAppStore((s) => s.openTile);
  const goHome = useAppStore((s) => s.goHome);

  if (stage !== "home" && stage !== "tile") return null;

  return (
    <nav
      aria-label="ناوبری اصلی اپلیکیشن"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="grid grid-cols-5 h-16 max-w-lg mx-auto">
        {ITEMS.map(({ id, label, icon: Icon, activeClass }) => {
          const active = id === null ? stage === "home" : activeTileId === id;
          return (
            <li key={label} className="flex">
              <button
                type="button"
                aria-current={active ? "page" : undefined}
                aria-label={label}
                onClick={() => {
                  haptic("tap");
                  if (id === null) goHome();
                  else openTile(id);
                }}
                className={`relative flex-1 min-h-11 min-w-11 flex flex-col items-center justify-center gap-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset rounded-lg m-1 active:scale-95 transition-transform motion-reduce:transition-none ${active ? activeClass : "text-muted-foreground"}`}
              >
                <span aria-hidden className={`absolute -top-px h-0.5 w-8 rounded-full ${active ? "bg-current" : "bg-transparent"}`} />
                <Icon className="size-5" aria-hidden />
                <span className="text-[10px] font-medium leading-none">{label}</span>
                <span aria-hidden className="ripple-host absolute inset-0 rounded-lg overflow-hidden" />
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
