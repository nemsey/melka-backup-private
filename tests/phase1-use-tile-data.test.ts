/**
 * تست‌های PHASE 1 — P1-01d: هوک مشترک useTileData
 * ------------------------------------------------------
 * رندر واقعی با happy-dom + react-dom/client + act —
 * پوشش قرارداد رفتاری عین کد قبلی صفحات:
 *   • بارگذاری اولیه (loading=true) → موفق (data + loading=false)
 *   • خطا → toast مخرب با errorTitle/description
 *   • خطا → errorValue (پیش‌فرض: دست‌نخورده؛ سفارشی: تبدیل)
 *   • تغییر هویت fetcher → واکشی مجدد
 *   • reload() → واکشی مجدد دستی
 */

import { describe, expect, test, mock, beforeEach } from "bun:test";
import { Window } from "happy-dom";

// ---------- نصب DOM قبل از import های React ----------
const win = new Window();
const g = globalThis as unknown as Record<string, unknown>;
for (const key of [
  "document", "navigator", "HTMLElement", "Element", "Node", "TextNode",
  "DocumentFragment", "DocumentType", "Comment", "SVGElement", "customElements",
  "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame",
  "MutationObserver", "ResizeObserver", "IntersectionObserver", "matchMedia",
  "scrollTo", "KeyboardEvent", "MouseEvent", "Event", "CustomEvent", "DOMParser",
  "history", "location", "CSSStyleDeclaration",
]) {
  const v = (win as unknown as Record<string, unknown>)[key];
  if (v !== undefined && !(key in g)) g[key] = v;
}
g.window = win;
g.self = win;
g.IS_REACT_ACT_ENVIRONMENT = true;

// ---------- mock ماژول toast (قبل از import هوک) ----------
const toasts: Array<{ title?: string; description?: string; variant?: string }> = [];
mock.module("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: (t: { title?: string; description?: string; variant?: string }) => void toasts.push(t) }),
}));

const { useTileData } = await import("@/components/app/shared");
const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act } = React;

interface HarnessResult<T> {
  data: T | null;
  loading: boolean;
  reload: () => void;
}

function makeHarness<T>() {
  // جعبه ثبت خروجی هوک — جهش پراپرتی (نه انتساب مجدد متغیر بستاری)
  const box: { current: HarnessResult<T> | null } = { current: null };
  const Harness = ({ fetcher, opts }: { fetcher: () => Promise<T>; opts: { errorTitle: string; errorValue?: (prev: T | null) => T | null } }) => {
    box.current = useTileData(fetcher, opts);
    return null;
  };
  return {
    Harness,
    current: () => box.current as HarnessResult<T>,
  };
}

function mount<T>(Harness: React.ComponentType<{ fetcher: () => Promise<T>; opts: { errorTitle: string; errorValue?: (prev: T | null) => T | null } }>) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container as unknown as HTMLElement);
  return { root, container };
}

beforeEach(() => {
  toasts.length = 0;
});

describe("P1-01d / useTileData — قرارداد رفتاری", () => {
  test("بارگذاری اولیه: loading=true → موفق: data تنظیم و loading=false", async () => {
    const { Harness, current } = makeHarness<{ n: number }>();
    const { root, container } = mount<{ n: number }>(Harness);
    // fetcher معلق: تا resolve دستی، حالت بارگذاری قابل مشاهده است
    let release!: (v: { n: number }) => void;
    const pending = new Promise<{ n: number }>((resolve) => {
      release = resolve;
    });

    await act(async () => {
      root.render(React.createElement(Harness, { fetcher: () => pending, opts: { errorTitle: "خطا" } }));
    });
    expect(current()?.loading).toBe(true);
    expect(current()?.data).toBe(null);

    await act(async () => {
      release({ n: 7 });
      await Promise.resolve();
    });

    expect(current()?.data).toEqual({ n: 7 });
    expect(current()?.loading).toBe(false);
    expect(toasts).toEqual([]);
    act(() => root.unmount());
    container.remove();
  });

  test("خطا با پیش‌فرض: toast مخرب + داده دست‌نخورده (سبک قراردادها/مالی)", async () => {
    const { Harness, current } = makeHarness<{ rows: number[] }>();
    const { root, container } = mount<{ rows: number[] }>(Harness);
    const boom = async () => {
      throw new Error("قطع شبکه");
    };

    await act(async () => {
      root.render(React.createElement(Harness, { fetcher: boom as unknown as () => Promise<{ rows: number[] }>, opts: { errorTitle: "خطا در دریافت قراردادها" } }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(toasts.length).toBe(1);
    expect(toasts[0]?.title).toBe("خطا در دریافت قراردادها");
    expect(toasts[0]?.description).toBe("قطع شبکه");
    expect(toasts[0]?.variant).toBe("destructive");
    expect(current()?.data).toBe(null); // دست‌نخورده
    expect(current()?.loading).toBe(false);
    act(() => root.unmount());
    container.remove();
  });

  test("خطا با errorValue: تبدیل داده (سبک معاملات — rows خالی، خلاصه قبلی می‌ماند)", async () => {
    const { Harness, current } = makeHarness<{ rows: number[]; summary: string | null }>();
    const { root, container } = mount<{ rows: number[]; summary: string | null }>(Harness);
    const ok = async () => ({ rows: [1, 2], summary: "قبلی" });
    const errorValue = (prev: { rows: number[]; summary: string | null } | null) =>
      prev ? { ...prev, rows: [] } : { rows: [], summary: null };

    // اول موفق
    await act(async () => {
      root.render(React.createElement(Harness, { fetcher: ok, opts: { errorTitle: "خطا", errorValue } }));
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(current()?.data).toEqual({ rows: [1, 2], summary: "قبلی" });

    // سپس خطا: فقط rows خالی می‌شود؛ summary قبلی می‌ماند (عین رفتار قبلی)
    const boom = async () => {
      throw new Error("خطای دوم");
    };
    await act(async () => {
      root.render(React.createElement(Harness, { fetcher: boom as unknown as () => Promise<{ rows: number[]; summary: string | null }>, opts: { errorTitle: "خطا", errorValue } }));
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(current()?.data).toEqual({ rows: [], summary: "قبلی" });
    expect(current()?.loading).toBe(false);
    act(() => root.unmount());
    container.remove();
  });

  test("خطای بارگذاری اولیه با errorValue: مقدار خالی (نه اسکلتون بی‌پایان)", async () => {
    const { Harness, current } = makeHarness<{ rows: number[] }>();
    const { root, container } = mount<{ rows: number[] }>(Harness);
    const boom = async () => {
      throw new Error("شکست اول");
    };
    const errorValue = (prev: { rows: number[] } | null) => (prev ? { ...prev, rows: [] } : { rows: [] });

    await act(async () => {
      root.render(React.createElement(Harness, { fetcher: boom as unknown as () => Promise<{ rows: number[] }>, opts: { errorTitle: "خطا", errorValue } }));
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(current()?.data).toEqual({ rows: [] });
    act(() => root.unmount());
    container.remove();
  });

  test("تغییر هویت fetcher → واکشی مجدد (الگوی تغییر فیلتر)", async () => {
    const { Harness, current } = makeHarness<{ q: string }>();
    const { root, container } = mount<{ q: string }>(Harness);
    let calls = 0;
    const makeFetcher = (q: string) => async () => {
      calls += 1;
      return { q };
    };

    await act(async () => {
      root.render(React.createElement(Harness, { fetcher: makeFetcher("الف"), opts: { errorTitle: "خطا" } }));
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(current()?.data).toEqual({ q: "الف" });
    expect(calls).toBe(1);

    await act(async () => {
      root.render(React.createElement(Harness, { fetcher: makeFetcher("ب"), opts: { errorTitle: "خطا" } }));
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(calls).toBe(2);
    expect(current()?.data).toEqual({ q: "ب" });
    act(() => root.unmount());
    container.remove();
  });

  test("reload() → واکشی مجدد دستی (دکمه «بازخوانی»)", async () => {
    const { Harness, current } = makeHarness<{ c: number }>();
    const { root, container } = mount<{ c: number }>(Harness);
    let counter = 0;
    const fetcher = async () => {
      counter += 1;
      return { c: counter };
    };

    await act(async () => {
      root.render(React.createElement(Harness, { fetcher, opts: { errorTitle: "خطا" } }));
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(counter).toBe(1);

    await act(async () => {
      current()?.reload();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(counter).toBe(2);
    expect(current()?.data).toEqual({ c: 2 });
    act(() => root.unmount());
    container.remove();
  });
});

describe("P1-01d / useTileData — ادعاهای ساختاری (grep)", () => {
  test("هر ۸ صفحه CRM از useTileData استفاده می‌کنند", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const TILES = "/home/z/my-project/src/core/tiles/tiles";
    const pages = [
      "transactions/TransactionsPage.tsx",
      "experts/ExpertsPage.tsx",
      "supply-demand/SupplyDemandPage.tsx",
      "visits/VisitsPage.tsx",
      "finance-commission/FinancePage.tsx",
      "price-index/PriceIndexPage.tsx",
      "contracts/ContractsPage.tsx",
      "customer-club/CustomerClubPage.tsx",
    ];
    for (const p of pages) {
      expect(readFileSync(join(TILES, p), "utf8")).toContain("useTileData(");
    }
  });

  test("صفر الگوی دستی load/toast قدیمی در ۸ صفحه (setLoading + toast در catch)", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const TILES = "/home/z/my-project/src/core/tiles/tiles";
    const pages = [
      "transactions/TransactionsPage.tsx",
      "experts/ExpertsPage.tsx",
      "supply-demand/SupplyDemandPage.tsx",
      "visits/VisitsPage.tsx",
      "finance-commission/FinancePage.tsx",
      "price-index/PriceIndexPage.tsx",
      "contracts/ContractsPage.tsx",
      "customer-club/CustomerClubPage.tsx",
    ];
    for (const p of pages) {
      const c = readFileSync(join(TILES, p), "utf8");
      expect(c).not.toContain("setLoading(true)");
      expect(c).not.toContain("setLoading(false)");
    }
  });
});
