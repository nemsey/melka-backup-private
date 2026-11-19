"use client";

/**
 * BottomNav — ناوبری پایین «دسترسی سریع به کاشی‌ها» (قانون ظاهر فاخر ۰۳۵-B — بخش ج/۳)
 * ------------------------------------------------------------------
 * DIR-FF-TILE-003 (دستور مالک ۱۴۰۵/۰۸/۳۰ · ثالثاً) — هفت آیتم به ترتیب الزامی:
 *   فایل‌یابی · آگهی · درخواست · معاملات · تطبیق · تغییرات · تنظیمات
 * (کاشی «مغز ملکا» حذف شد — در تنظیمات ادغام شد؛ «کارشناسان» از نوار پایین به
 * هوم محدود است — عین فهرست اعلامی مالک)
 * · نکتهٔ مالک: آیتم‌ها «به صورت کوچک» قرار داده شده‌اند تا با هم تداخل
 *   نداشته باشند و زیبا دیده شوند — آیکون size-4 + برچسب ۹px + فشردگی عمودی.
 * · فقط موبایل (md:hidden) — دسکتاپ از کاشی‌های هوم استفاده می‌کند.
 * · رنگ فعال = رنگ اختصاصی همان بخش (نظام رنگ ۱۳گانه) · Ripple + Haptic.
 * · مرز دسترسی عین هوم (PN-008 BLOCK 7): کاشی فقط-مالک (تطبیق/تغییرات) برای
 *   مشاورِ فاقد دسترس پنهان می‌شود — ستون‌ها با شمارِ آیتم‌های مرئی سازگار می‌مانند.
 * · Safe-area (نوار iOS) · اندازهٔ تاچ ≥ ۴۴px · ARIA (nav + aria-current).
 */

import { Building2, ClipboardList, FileCheck2, FilePen, Radar, Settings2, Sparkles } from "lucide-react";
import { useAppStore } from "@/lib/client/store";
import { haptic } from "@/lib/haptics";
import type { LucideIcon } from "lucide-react";

const ITEMS: { id: string; label: string; icon: LucideIcon; activeClass: string }[] = [
  { id: "file-finder", label: "فایل‌یابی", icon: Radar, activeClass: "text-sec-finder-700" },
  { id: "arm-listings", label: "آگهی", icon: Building2, activeClass: "text-sec-m1-700" },
  { id: "arm-requests", label: "درخواست", icon: ClipboardList, activeClass: "text-sec-m2-700" },
  { id: "transactions-contracts", label: "معاملات", icon: FileCheck2, activeClass: "text-sec-m3-700" },
  { id: "smart-matching", label: "تطبیق", icon: Sparkles, activeClass: "text-sec-m5-700" },
  { id: "changes", label: "تغییرات", icon: FilePen, activeClass: "text-sec-ai-700" },
  { id: "settings", label: "تنظیمات", icon: Settings2, activeClass: "text-sec-settings-700" },
];

export function BottomNav() {
  const activeTileId = useAppStore((s) => s.activeTileId);
  const stage = useAppStore((s) => s.stage);
  const openTile = useAppStore((s) => s.openTile);
  const userRole = useAppStore((s) => s.user?.role ?? "CONSULTANT");
  const tileAccess = useAppStore((s) => s.tileAccess);

  if (stage !== "home" && stage !== "tile") return null;

  // همان فرمول دسترسی هوم (PN-008 BLOCK 7) — مرز دسترسی کاشی‌ها حفظ می‌شود
  const allowed = (id: string) =>
    userRole === "OWNER" || !tileAccess || tileAccess.tiles.includes(id) || id === "settings";
  const visible = ITEMS.filter((it) => allowed(it.id));
  if (visible.length === 0) return null;

  return (
    <nav
      aria-label="ناوبری اصلی اپلیکیشن"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 pb-[env(safe-area-inset-bottom)]"
    >
      <ul
        className="grid h-14 max-w-lg mx-auto"
        style={{ gridTemplateColumns: `repeat(${visible.length}, minmax(0, 1fr))` }}
      >
        {visible.map(({ id, label, icon: Icon, activeClass }) => {
          const active = activeTileId === id;
          return (
            <li key={label} className="flex">
              <button
                type="button"
                aria-current={active ? "page" : undefined}
                aria-label={label}
                onClick={() => {
                  haptic("tap");
                  openTile(id);
                }}
                className={`relative flex-1 min-h-11 min-w-0 flex flex-col items-center justify-center gap-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset rounded-lg active:scale-95 transition-transform motion-reduce:transition-none ${active ? activeClass : "text-muted-foreground"}`}
              >
                <span aria-hidden className={`absolute -top-px h-0.5 w-7 rounded-full ${active ? "bg-current" : "bg-transparent"}`} />
                {/* نکتهٔ مالک: اندازهٔ کوچک — بدون تداخل و زیبا (size-4 + text-[9px]) */}
                <Icon className="size-4" aria-hidden />
                <span className="text-[9px] font-medium leading-none whitespace-nowrap">{label}</span>
                <span aria-hidden className="ripple-host absolute inset-0 rounded-lg overflow-hidden" />
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
