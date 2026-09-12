/**
 * تست معماری کاشی/پلاگین — TileContract و TileRegistry
 * اجرا: bun test tests/tile-registry.test.ts
 */

import { describe, expect, test, beforeEach } from "bun:test";
import { defineTile } from "@/core/tiles/tile-contract";
import { tileRegistry } from "@/core/tiles/tile-registry";

const Dummy = () => null;

function makeTile(overrides: Partial<Parameters<typeof defineTile>[0]> = {}) {
  return defineTile({
    id: "test-tile",
    version: "1.0.0",
    title: "کاشی تست",
    tagline: "تست",
    description: "تست",
    icon: Dummy,
    accent: "emerald",
    component: Dummy,
    order: 10,
    settings: [{ key: "k", label: "تنظیم", type: "switch", defaultValue: true }],
    agent: null,
    ...overrides,
  });
}

describe("قرارداد کاشی (defineTile)", () => {
  test("تعریف معتبر بدون خطا", () => {
    expect(() => makeTile()).not.toThrow();
  });
  test("شناسه نامعتبر رد می‌شود (حروف بزرگ/فاصله)", () => {
    expect(() => makeTile({ id: "Invalid-ID" })).toThrow();
    expect(() => makeTile({ id: "bad id" })).toThrow();
    expect(() => makeTile({ id: "2fast" })).toThrow(); // شروع با رقم
  });
  test("اتصال ایجنت به کاشی دیگر رد می‌شود (ایزوله‌سازی)", () => {
    expect(() =>
      makeTile({ agent: { tileId: "another-tile", insightDomains: ["X"], capabilities: ["memory"] } })
    ).toThrow();
  });
  test("بدون کامپوننت رد می‌شود", () => {
    expect(() => makeTile({ component: undefined as unknown as typeof Dummy })).toThrow();
  });
});

describe("رجیستری کاشی", () => {
  beforeEach(() => {
    // پاک‌سازی پویا برای ایزوله تست‌ها
    for (const id of ["reg-a", "reg-b", "reg-owner"]) tileRegistry.unregister(id);
  });

  test("ثبت و بازیابی", () => {
    tileRegistry.register(makeTile({ id: "reg-a", order: 2 }));
    expect(tileRegistry.has("reg-a")).toBe(true);
    expect(tileRegistry.get("reg-a")?.title).toBe("کاشی تست");
    expect(tileRegistry.size).toBeGreaterThanOrEqual(1);
  });

  test("شناسه تکراری خطا می‌دهد (جلوگیری از تعارض پلاگین‌ها)", () => {
    tileRegistry.register(makeTile({ id: "reg-b" }));
    expect(() => tileRegistry.register(makeTile({ id: "reg-b" }))).toThrow();
  });

  test("حذف کاشی به بقیه آسیب نمی‌زند", () => {
    tileRegistry.register(makeTile({ id: "reg-a" }));
    tileRegistry.register(makeTile({ id: "reg-b" }));
    expect(tileRegistry.unregister("reg-a")).toBe(true);
    expect(tileRegistry.has("reg-b")).toBe(true);
    expect(tileRegistry.get("reg-a")).toBeUndefined();
  });

  test("فیلتر نقش: کاشی فقط-مالک برای مشاور پنهان است", () => {
    tileRegistry.register(makeTile({ id: "reg-owner", minRole: "OWNER" }));
    const consultantView = tileRegistry.listAll("CONSULTANT").map((t) => t.id);
    expect(consultantView).not.toContain("reg-owner");
    const ownerView = tileRegistry.listAll("OWNER").map((t) => t.id);
    expect(ownerView).toContain("reg-owner");
  });

  test("ترتیب نمایش رعایت می‌شود", () => {
    tileRegistry.unregister("reg-a");
    tileRegistry.unregister("reg-b");
    tileRegistry.register(makeTile({ id: "reg-b", order: 2 }));
    tileRegistry.register(makeTile({ id: "reg-a", order: 1 }));
    const ids = tileRegistry.listAll("CONSULTANT").filter((t) => t.id.startsWith("reg-")).map((t) => t.id);
    expect(ids.indexOf("reg-a")).toBeLessThan(ids.indexOf("reg-b"));
  });
});
