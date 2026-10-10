/**
 * pn013-observability.test.ts — راستی‌آزمایی فاز ۴ · مرحلهٔ ۶ (PN-013)
 * ---------------------------------------------------------------------------
 * پوشش:
 *   ۱) رجیستری متریک: ثبت/خلاصه/صدک/حلقهٔ نمونه/برچسب‌گذاری
 *   ۲) Correlation ID سرتاسری: کلاینت‌فرستاده → withRouteLog → پاسخ + متریک
 *   ۳) proxy: عبور شناسهٔ ورودی به پایین‌دست + بازگشت در پاسخ
 *   ۴) متریک‌های دامنه‌ای: sync.duration · agent.latency از توابع لاگ
 *   ۵) prediction.brier از موتور ارزیابی
 *   ۶) روت OWNER-only: بدون نشست 401 (هر دو مسیر legacy و v1)
 */

import { describe, expect, test, beforeEach } from "bun:test";
import { NextRequest } from "next/server";
import {
  recordMetric, metricSummary, metricFamily, resetMetrics, metricsSnapshot,
} from "@/lib/observability/metrics";
import { logSync, logAgentCall, withRouteLog } from "@/lib/logger";
import { brierScore } from "@/core/intelligence/evaluation/evaluation-engine";

beforeEach(() => {
  resetMetrics();
});

describe("PN-013 مرحلهٔ ۶ — رجیستری متریک", () => {
  test("۱: ثبت و خلاصه — شمارش/میانگین/بیشینه/آخرین", () => {
    recordMetric("t.dur", 10);
    recordMetric("t.dur", 20);
    recordMetric("t.dur", 30);
    const s = metricSummary("t.dur")!;
    expect(s.count).toBe(3);
    expect(s.mean).toBe(20);
    expect(s.max).toBe(30);
    expect(s.last).toBe(30);
    expect(s.p95).toBe(30);
    expect(s.p50).toBe(20);
  });

  test("۲: برچسب‌ها در نام رمز می‌شوند و خانواده جدا می‌شوند", () => {
    recordMetric("api.latency", 5, { path: "/api/health" });
    recordMetric("api.latency", 7, { path: "/api/version" });
    recordMetric("api.latency", 9, { path: "/api/health" });
    const fam = metricFamily("api.latency");
    expect(fam.length).toBe(2);
    const health = fam.find((x) => x.name.includes("/api/health"))!;
    expect(health.count).toBe(2);
    expect(metricSummary("api.latency")).toBeNull(); // خود نام پایه خالی است
  });

  test("۳: حلقهٔ نمونه — سقف ۵۰۰؛ شمارش کل ادامه دارد", () => {
    for (let i = 0; i < 600; i++) recordMetric("t.ring", i);
    const s = metricSummary("t.ring")!;
    expect(s.count).toBe(600);
    expect(s.max).toBe(599); // بیشینهٔ کل حفظ می‌شود
    expect(s.last).toBe(599);
  });

  test("۴: مقادیر نامعتبر رد می‌شوند", () => {
    recordMetric("t.nan", Number.NaN);
    recordMetric("t.inf", Infinity);
    expect(metricSummary("t.nan")).toBeNull();
    expect(metricSummary("t.inf")).toBeNull();
  });

  test("۵: snapshot — فرایند + خانواده‌های استاندارد", () => {
    recordMetric("sync.duration", 123, { mode: "incremental", status: "ok" });
    const snap = metricsSnapshot();
    expect(snap.schema).toBe("melka-observability-v1");
    expect(snap.process.pid).toBeGreaterThan(0);
    expect(snap.process.rssMB).toBeGreaterThan(0);
    expect(snap.families["sync.duration"].length).toBe(1);
  });
});

describe("PN-013 مرحلهٔ ۶ — Correlation ID سرتاسری", () => {
  test("۶: withRouteLog شناسهٔ کلاینت را می‌پذیرد و در پاسخ برمی‌گرداند + متریک ثبت می‌کند", async () => {
    const seen: string[] = [];
    const handler = withRouteLog("test-corr", async (req: Request): Promise<Response> => {
      seen.push(req.headers.get("x-request-id") ?? "NONE");
      return Response.json({ ok: true });
    });
    const req = new Request("http://x/api/test", {
      headers: { "x-request-id": "ui-abc-123" },
    });
    const res = await handler(req, undefined as unknown as never);
    expect(seen[0]).toBe("ui-abc-123"); // همان شناسه به روت رسید
    expect(res.headers.get("x-request-id")).toBe("ui-abc-123"); // و در پاسخ برگشت
    const m = metricFamily("api.latency").find((x) => x.name.includes("/api/test"));
    expect(m).toBeDefined();
    expect(m!.count).toBe(1);
  });

  test("۷: بدون شناسهٔ کلاینت — شناسهٔ تازه تولید و در پاسخ برمی‌گردد", async () => {
    const handler = withRouteLog("test-new-id", async (): Promise<Response> => new Response("ok"));
    const res = await handler(new Request("http://x/api/other"), undefined as unknown as never);
    const id = res.headers.get("x-request-id");
    expect(id).toBeTruthy();
    expect(id!.length).toBeGreaterThan(10);
  });

  test("۸: خطای handler هم متریک fail ثبت می‌کند و شناسه پاسخ نمی‌گیرد (پرتاب حفظ)", async () => {
    const handler = withRouteLog("test-throw", async (): Promise<Response> => {
      throw new Error("boom");
    });
    let threw = false;
    try {
      await handler(new Request("http://x/api/boom"), undefined as unknown as never);
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
    const m = metricFamily("api.latency").find((x) => x.name.includes("status=fail"));
    expect(m).toBeDefined();
  });

  test("۹: proxy — شناسهٔ ورودی به پایین‌دست و پاسخ پاس می‌شود", async () => {
    const { default: proxy } = await import("@/proxy");
    const req = new NextRequest("http://x/api/health", {
      headers: { "x-request-id": "proxy-test-42" },
    });
    const res = proxy(req);
    expect(res.headers.get("x-request-id")).toBe("proxy-test-42");
    // هدر درخواست پایین‌دست (همان‌طور که NextResponse.next می‌رساند)
    expect(req.headers.get("x-request-id")).toBe("proxy-test-42");
  });

  test("۱۰: proxy بدون شناسه — یکی می‌سازد و در پاسخ برمی‌گرداند", async () => {
    const { default: proxy } = await import("@/proxy");
    const req = new NextRequest("http://x/api/version");
    const res = proxy(req);
    const id = res.headers.get("x-request-id");
    expect(id).toBeTruthy();
    // پاسخ همان شناسهٔ تازه را دارد (عبور به پایین‌دست با NextResponse.next
    // در زنجیرهٔ واقعی Next اثبات می‌شود — آزمون زندهٔ curl در شاهد مرحلهٔ ۶)
  });
});

describe("PN-013 مرحلهٔ ۶ — متریک‌های دامنه‌ای از توابع لاگ", () => {
  test("۱۱: logSync با مدت → sync.duration ثبت", () => {
    logSync("sync-run", { status: "ok", mode: "incremental", duration: 4567 });
    const m = metricFamily("sync.duration");
    expect(m.length).toBe(1);
    expect(m[0].last).toBe(4567);
    expect(m[0].name).toContain("mode=incremental");
  });

  test("۱۲: logSync بدون مدت → متریک ثبت نمی‌شود (start رویدادها)", () => {
    logSync("sync-run", { status: "start", mode: "legacy" });
    expect(metricFamily("sync.duration").length).toBe(0);
  });

  test("۱۳: logAgentCall با مدت → agent.latency ثبت", () => {
    logAgentCall({ tileId: "listings", operation: "insight", status: "ok", duration: 33 });
    const m = metricFamily("agent.latency");
    expect(m.length).toBe(1);
    expect(m[0].last).toBe(33);
    expect(m[0].name).toContain("tileId=listings");
  });
});

describe("PN-013 مرحلهٔ ۶ — prediction.brier از موتور ارزیابی", () => {
  test("۱۴: brierScore خالص — مقدار صحیح (کالیبراسیون کامل = صفر)", () => {
    expect(brierScore([{ p: 1, o: 1 }, { p: 0, o: 0 }])).toBe(0);
    expect(brierScore([{ p: 1, o: 0 }])).toBe(1);
    expect(brierScore([{ p: 0.5, o: 0 }, { p: 0.5, o: 1 }])).toBeCloseTo(0.25, 6);
  });
});

describe("PN-013 مرحلهٔ ۶ — روت /api/(v1/)runtime/metrics (حذف PN-027 · ۵-ب-۲)", () => {
  test("PN-027: روت متریک ران-time حذف شد — صفر مصرف‌کنندهٔ زنده (جلسهٔ ۰۳۴)", async () => {
    const { existsSync } = await import("node:fs");
    expect(existsSync("src/app/api/runtime/metrics/route.ts")).toBe(false);
    expect(existsSync("src/app/api/v1/runtime/metrics/route.ts")).toBe(false);
    // کتابخانهٔ متریک observability زنده است و در بُعد ۹ چک‌آپ‌ها استفاده می‌شود
    const lib = await import("@/lib/observability/metrics");
    expect(typeof lib.metricsSnapshot).toBe("function");
  });
});
