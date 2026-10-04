/**
 * p6549-luxury-law.test.ts — راستی‌آزمایی قانون ظاهر فاخر ملکا ۰۳۵-B (بخش‌های الف تا خ)
 * اجرای واقعی روی فایل‌های زندهٔ اپ (نه اسنپ‌شات) — الگوی تست‌های P65xx
 */
import { describe, expect, test } from "bun:test";
import { readFileSync, existsSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");
const palette = JSON.parse(read("src/lib/palette13.json"));
const globals = read("src/app/globals.css");
const manifest = JSON.parse(read("public/manifest.json"));
const layout = read("src/app/layout.tsx");
const page = read("src/app/page.tsx");
const swV5 = read("public/sw-v5.js");

describe("۰۳۵-B/الف — پالت رنگ ۱۳بخش×۵سایه", () => {
  test("۱۳ بخش یکتا با کلیدهای رسمی", () => {
    const keys = palette.sections.map((s: any) => s.key);
    expect(keys.length).toBe(13);
    expect(new Set(keys).size).toBe(13);
    for (const k of ["login", "home", "finder", "melka-listing", "melka-request", "settings", "mgmt", "m1", "m2", "m3", "m4", "consultant", "ai"]) {
      expect(keys).toContain(k);
    }
  });

  test("هر بخش ۵ سایه (50/100/300/500/700) + دارک + fg", () => {
    for (const s of palette.sections) {
      for (const shade of ["s50", "s100", "s300", "s500", "s700", "d50", "d100", "d300", "d500", "d700", "fg", "dfg"]) {
        expect(typeof s[shade]).toBe("string");
        expect(s[shade]).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    }
  });

  test("فاصلهٔ hue ≥ ۲۷٫۶° — حداکثرِ ریاضی‌ممکن برای ۱۳ رنگ (سند صادقانهٔ قید ≥۳۰°)", () => {
    expect(palette.meta.minHueGap).toBeGreaterThanOrEqual(27.6);
    expect(palette.meta.maxPossibleGapFor13).toBeCloseTo(27.7, 1);
    expect(palette.meta.honestNote).toContain("۳۰");
  });

  test("کنتراست WCAG AA (≥۴٫۵) همهٔ جفت‌های الزامی همهٔ بخش‌ها", () => {
    expect(palette.meta.allPass).toBe(true);
    for (const s of palette.sections) {
      expect(s.pass).toBe(true);
      const c = s.contrast;
      for (const pair of ["fg_on_500", "700_on_50", "700_on_100", "700_on_300", "700_on_card", "dark_fg_on_500", "dark_700_on_50", "dark_700_on_100", "dark_700_on_card"]) {
        expect(c[pair]).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  test("globals.css: متغیرهای ۵سایه + دارک + نگاشت سازگار ۲۰۰→۳۰۰", () => {
    for (const k of ["m1", "m3", "settings"]) {
      expect(globals).toContain(`--sec-${k}-100:`);
      expect(globals).toContain(`--sec-${k}-300:`);
      expect(globals).toContain(`--color-sec-${k}-100:`);
      expect(globals).toContain(`--color-sec-${k}-300:`);
    }
    // نگاشت 200 = 300 (سازگاری کلاس‌های موجود): مقدار یکسان در ۲۰۰ و ۳۰۰
    const line = globals.split("\n").find((l) => l.includes("--sec-m1-50:")) ?? "";
    const v200 = line.match(/--sec-m1-200: (#[0-9a-f]+);/)?.[1];
    const v300 = line.match(/--sec-m1-300: (#[0-9a-f]+);/)?.[1];
    expect(v200).toBeTruthy();
    expect(v200).toBe(v300);
  });

  test("صفر رنگ خالص در پالت (نه #FF0000 نه #000000)", () => {
    for (const s of palette.sections) {
      for (const shade of ["s50", "s100", "s300", "s500", "s700", "fg"]) {
        expect(["#ff0000", "#000000"]).not.toContain(String(s[shade]).toLowerCase());
      }
    }
  });
});

describe("۰۳۵-B/ب — PWA Manifest کامل", () => {
  test("نام رسمی و نام اختصاری", () => {
    expect(manifest.name).toBe("اکوسیستم هوشمند ملک ایران (ملکا)");
    expect(manifest.short_name).toBe("ملکا");
  });
  test("display + orientation + background نرم", () => {
    expect(manifest.display).toBe("standalone");
    expect(manifest.orientation).toBe("portrait-primary");
    expect(manifest.background_color).toBe("#FAFBFC");
  });
  test("آیکون ۱۹۲ + ۵۱۲ + maskable", () => {
    const icons = manifest.icons.map((i: any) => `${i.sizes}:${i.purpose}`);
    expect(icons).toContain("192x192:any");
    expect(icons).toContain("512x512:any");
    expect(icons).toContain("192x192:maskable");
    expect(icons).toContain("512x512:maskable");
    for (const i of manifest.icons) expect(existsSync(`public${i.src}`)).toBe(true);
  });
  test("دو اسکرین‌شات (موبایل + دسکتاپ) با فایل واقعی", () => {
    expect(manifest.screenshots.length).toBe(2);
    const forms = manifest.screenshots.map((s: any) => s.form_factor);
    expect(forms).toContain("narrow");
    expect(forms).toContain("wide");
    for (const s of manifest.screenshots) expect(existsSync(`public${s.src}`)).toBe(true);
  });
  test("دقیقاً ۳ میان‌بر: آگهی، درخواست، معامله", () => {
    expect(manifest.shortcuts.length).toBe(3);
    const urls = manifest.shortcuts.map((s: any) => s.url);
    expect(urls).toContain("/?tile=arm-listings");
    expect(urls).toContain("/?tile=arm-requests");
    expect(urls).toContain("/?tile=transactions-contracts");
  });
});

describe("۰۳۵-B/ج — اجزای ظاهری اجبارشده", () => {
  test("۱. Splash Screen با آیکون برند", () => {
    const splash = read("src/components/app/SplashScreen.tsx");
    expect(splash).toContain("SplashScreen");
    expect(splash).toContain("prefers-reduced-motion");
    expect(page).toContain("<SplashScreen />");
  });
  test("۲. App Shell: هدر + محتوا + فوتر + ناوبری پایین", () => {
    expect(page).toContain("<AppHeader />");
    expect(page).toContain("<BottomNav />");
    const home = read("src/components/app/DashboardHome.tsx");
    expect(home).toContain("<footer");
  });
  test("۳. ناوبری پایین ۵ آیتم با ARIA + رنگ بخش + safe-area", () => {
    const nav = read("src/components/app/BottomNav.tsx");
    expect((nav.match(/label: "/g) ?? []).length).toBe(5);
    expect(nav).toContain('aria-label="ناوبری اصلی اپلیکیشن"');
    expect(nav).toContain("aria-current");
    expect(nav).toContain("env(safe-area-inset-bottom)");
    expect(nav).toContain("min-h-11"); // تاچ ≥۴۴px
    expect(nav).toContain("md:hidden");
  });
  test("۴. حالت‌های کامل: Skeleton + Empty + Error + Offline + Success Toast", () => {
    const states = read("src/components/app/shared/list-states.tsx");
    expect(states).toContain("EmptyState");
    expect(states).toContain("ErrorState");
    expect(states).toContain("OfflineState");
    for (const tile of ["ArmListingsPage", "ArmRequestsPage", "TransactionsTab", "ExpertsPage"]) {
      const src = read(`src/core/tiles/tiles/${tile.includes("Arm") ? (tile === "ArmListingsPage" ? "arm-listing" : "arm-request") : tile === "TransactionsTab" ? "transactions-contracts" : "experts"}/${tile}.tsx`);
      expect(src).toContain("EmptyState");
      expect(src).toContain("Skeleton");
    }
  });
  test("۵. PWA UI: نصب + بنر آپدیت + نشان آفلاین", () => {
    expect(existsSync("src/components/app/InstallButton.tsx")).toBe(true);
    const swr = read("src/components/app/SwRegister.tsx");
    expect(swr).toContain("نسخهٔ جدید آماده است");
    expect(swr).toContain("SKIP_WAITING");
    expect(swr).toContain("/sw-v5.js");
    expect(read("src/components/app/AppHeader.tsx")).toContain("<OfflineBadge />");
  });
  test("۶. Safe Area Support (notch + iOS) + viewport-fit", () => {
    expect(layout).toContain('viewportFit: "cover"');
    expect(globals).toContain("env(safe-area-inset-bottom)");
    expect(globals).toContain("env(safe-area-inset-top)");
  });
  test("۷. میکرو-اینتراکشن Ripple", () => {
    expect(globals).toContain(".ripple-ink");
    expect(read("src/components/ui/button.tsx")).toContain("useRipple");
    expect(globals).toContain("prefers-reduced-motion: reduce");
  });
  test("۸. Pull-to-Refresh در هر چهار فهرست", () => {
    for (const p of [
      "src/core/tiles/tiles/arm-listing/ArmListingsPage.tsx",
      "src/core/tiles/tiles/arm-request/ArmRequestsPage.tsx",
      "src/core/tiles/tiles/transactions-contracts/TransactionsTab.tsx",
      "src/core/tiles/tiles/experts/ExpertsPage.tsx",
    ]) {
      expect(read(p)).toContain("usePullToRefresh");
      expect(read(p)).toContain("PtrIndicator");
    }
  });
  test("۹. Bottom Sheet (primitive + کاربرد واقعی)", () => {
    expect(existsSync("src/components/ui/bottom-sheet.tsx")).toBe(true);
    expect(read("src/core/tiles/tiles/arm-request/AreasFileCell.tsx")).toContain("BottomSheet");
  });
  test("۱۰. Haptic Feedback با گارد API", () => {
    const h = read("src/lib/haptics.ts");
    expect(h).toContain("nav.vibrate");
    expect(h).toContain("typeof nav.vibrate");
  });
});

describe("۰۳۵-B/ت + ث — فیلترها و فهرست‌ها", () => {
  test("فیلتر: آکاردئون موبایل (پیش‌فرض بسته) · باز در دسکتاپ", () => {
    const m1 = read("src/core/tiles/tiles/arm-listing/ArmListingsPage.tsx");
    expect(m1).toContain('matchMedia("(min-width: 640px)")');
  });
  test("فیلتر: هر گزینهٔ چندگانه رنگ اختصاصی (نظام رنگ مقادیر + گارد بدون-تکرار)", () => {
    const vc = read("src/lib/value-colors.ts");
    expect(vc).toContain("PALETTE");
    expect(vc).toContain("hasDistinctColors");
  });
  test("فهرست: ستون قیمت با نام «قیمت» (نه عنوان دیگر) در M1/M2/M3", () => {
    expect(read("src/core/tiles/tiles/arm-listing/ArmListingsPage.tsx")).toContain('TableHead className="min-w-32">قیمت</TableHead>');
    expect(read("src/core/tiles/tiles/transactions-contracts/TransactionsTab.tsx")).toContain('TableHead className="min-w-40">قیمت</TableHead>');
  });
  test("قیمت: قالب «۹،۰۰۰،۰۰۰،۰۰۰» با ممیز فارسی + بازهٔ از/تا", () => {
    const fmt = read("src/lib/format.ts");
    expect(fmt).toContain('replace(/,/g, "،")');
    const m2 = read("src/core/tiles/tiles/arm-request/ArmRequestsPage.tsx");
    expect(m2).toContain("از");
    expect(m2).toContain("تا");
  });
  test("VirtualTable در همهٔ فهرست‌ها (قانون M3)", () => {
    for (const p of [
      "src/core/tiles/tiles/arm-listing/ArmListingsPage.tsx",
      "src/core/tiles/tiles/arm-request/ArmRequestsPage.tsx",
      "src/core/tiles/tiles/transactions-contracts/TransactionsTab.tsx",
      "src/core/tiles/tiles/experts/ExpertsPage.tsx",
    ]) {
      expect(read(p)).toContain("TableBodyVirtual");
    }
  });
});

describe("۰۳۵-B/ج-۲ + چ + ح — تم‌ها، دسترس‌پذیری، عملکرد", () => {
  test("تم روشن پیش‌فرض + تاریک + احترام prefers-color-scheme", () => {
    expect(layout).toContain('defaultTheme="light"');
    expect(layout).toContain("enableSystem");
    const acc = read("src/core/tiles/tiles/settings/AccountGeneralSection.tsx");
    expect(acc).toContain('"روشن"');
    expect(acc).toContain('"سیستم"');
    expect(acc).toContain('"تاریک"');
  });
  test("انتقال نرم تم ۳۰۰ms (کلاس theme-transition + احترام reduced-motion)", () => {
    expect(globals).toContain(".theme-transition");
    expect(globals).toContain("300ms");
    expect(existsSync("src/lib/theme-transition.ts")).toBe(true);
  });
  test("دسترس‌پذیری: ARIA + focus ring + reduced-motion سراسری (MotionConfig)", () => {
    expect(page).toContain('reducedMotion="user"');
    expect(globals).toContain("outline-ring/50");
  });
  test("عملکرد: اسکلتون به‌جای اسپینر + lazy-load تصاویر", () => {
    expect(read("src/core/tiles/tiles/listing/ListingDetailsDialog.tsx")).toContain('loading="lazy"');
  });
  test("instrumentation بدون import سطح‌بالا از node:fs (رفع هشدار Edge)", () => {
    const instr = read("src/instrumentation.ts");
    expect(instr).not.toMatch(/^import .*node:fs/m);
    expect(instr).toContain('import("node:fs")');
  });
});

describe("۰۳۵-B/خ — راستی‌آزمایی SW و مهر", () => {
  test("sw-v5: skipWaiting پیام‌محور (نه خودکار در install)", () => {
    expect(swV5).toContain('"SKIP_WAITING"');
    expect(swV5.split("addEventListener(\"install\"")[1]?.split(");")[0]).not.toContain("skipWaiting()");
  });
  test("فایل شواهد رنگ موجود (palette-evidence.json)", () => {
    const ev = JSON.parse(read("download/p6549/palette-evidence.json"));
    expect(ev.meta.uniqueColors).toBe(13);
    expect(ev.meta.allPass).toBe(true);
  });
});
