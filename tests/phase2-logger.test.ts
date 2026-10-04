/**
 * تست‌های P2-05 — Logger ساختاریافته + رویدادهای الزامی + امنیت
 * ------------------------------------------------------
 * پوشش:
 *  ۱) خروجی JSON معتبر با همه فیلدهای الزامی (حتی وقتی null)
 *  ۲) پاک‌ساز تدافعی: کلید حساس → [redacted]؛ موبایل/کد بلند → ماسک
 *  ۳) فیلتر سطح لاگ
 *  ۴) پوشش‌های رایی: logAuth/logSync/logAgentCall/logRoute
 *  ۵) withRouteLog — پوشش کامل روت: start → ok|fail + duration + پاسخ عیناً عبوری
 *  ۶) middleware — خط آغاز برای هر /api/*
 *  ۷) رویدادهای الزامی: login (createSession) / logout (revokeSession)
 *  ۸) اسکنر audit-log-safety.sh — مثبت (نقض → exit 1) و منفی (پاک → exit 0)
 */

import { describe, expect, test, afterAll } from "bun:test";
import { createHash } from "crypto";

const { db } = await import("@/lib/db");

// ---------- ضبط stdout ----------
let captured: string[] = [];
const originalWrite = process.stdout.write.bind(process.stdout);
function startCapture() {
  captured = [];
  process.stdout.write = ((chunk: string | Uint8Array) => {
    captured.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString());
    return true;
  }) as typeof process.stdout.write;
}
function stopCapture() {
  process.stdout.write = originalWrite;
}
function lastLogLine(): Record<string, unknown> {
  const lines = captured.join("").split("\n").filter((l) => l.trim().startsWith("{"));
  return JSON.parse(lines[lines.length - 1]);
}

const createdSessions: string[] = [];
afterAll(async () => {
  stopCapture();
  for (const t of createdSessions) {
    await db.session.deleteMany({ where: { tokenHash: createHash("sha256").update(t).digest("hex") } }).catch(() => undefined);
  }
  await db.$disconnect();
});

// ==========================================================================
// ۱-۳) هسته Logger
// ==========================================================================

describe("P2-05 — هسته Logger", () => {
  test("خروجی JSON معتبر با همه فیلدهای الزامی (null برای نامربوط)", async () => {
    const { logEvent } = await import("@/lib/logger");
    startCapture();
    logEvent({ category: "system", operation: "unit-test", status: "ok" });
    stopCapture();

    const line = lastLogLine();
    expect(line.ts).toEqual(expect.any(String));
    expect(line.level).toBe("info");
    expect(line.category).toBe("system");
    expect(line.operation).toBe("unit-test");
    expect(line.status).toBe("ok");
    expect(line.requestId).toEqual(expect.any(String));
    expect(line.traceId).toBe(line.requestId); // پیش‌فرض
    expect(line.userId).toBeNull();
    expect(line.tenantId).toBe("melk-tabriz");
    expect(line.agentId).toBeNull();
    expect(line.tileId).toBeNull();
    expect(line.duration).toBeNull();
    expect(line.errorCode).toBeNull();
  });

  test("requestId/traceId صریح؛ duration و errorCode پاس‌شده", async () => {
    const { logEvent } = await import("@/lib/logger");
    startCapture();
    logEvent({ category: "route", operation: "op", status: "fail", requestId: "req-1", traceId: "trace-1", duration: 42, errorCode: "HTTP_500" });
    stopCapture();
    const line = lastLogLine();
    expect(line.requestId).toBe("req-1");
    expect(line.traceId).toBe("trace-1");
    expect(line.duration).toBe(42);
    expect(line.errorCode).toBe("HTTP_500");
  });

  test("پاک‌ساز: کلید حساس → [redacted]؛ موبایل و عدد بلند → ماسک؛ تو در تو", async () => {
    const { logEvent } = await import("@/lib/logger");
    startCapture();
    logEvent({
      category: "system",
      operation: "sanitize-test",
      status: "ok",
      detail: {
        accessToken: "super-secret-value",
        note: "تماس با 09141234567",
        nationalId: "1234567890",
        nested: { refreshToken: "x", safe: "ok", mobile: "09351112233" },
        plain: "بدون داده حساس",
      },
    });
    stopCapture();
    const raw = captured.join("");
    expect(raw).not.toContain("super-secret-value");
    expect(raw).not.toContain("09141234567");
    expect(raw).not.toContain("1234567890");
    expect(raw).not.toContain("09351112233");
    const line = lastLogLine();
    const detail = line.detail as Record<string, unknown>;
    expect(detail.accessToken).toBe("[redacted]");
    expect(detail.nested).toEqual({ refreshToken: "[redacted]", safe: "ok", mobile: "[masked-mobile]" });
    expect(detail.note).toContain("[masked-mobile]");
    expect(detail.nationalId).toBe("[masked-number]");
    expect(detail.plain).toBe("بدون داده حساس");
  });

  test("فیلتر سطح: debug در حالت پیش‌فرض (info) حذف می‌شود", async () => {
    const { logEvent, setMinLogLevel } = await import("@/lib/logger");
    startCapture();
    logEvent({ level: "debug", category: "system", operation: "quiet", status: "ok" });
    logEvent({ level: "warn", category: "system", operation: "loud", status: "fail" });
    stopCapture();
    const text = captured.join("");
    expect(text).not.toContain('"quiet"');
    expect(text).toContain('"loud"');

    setMinLogLevel("debug");
    startCapture();
    logEvent({ level: "debug", category: "system", operation: "quiet-now", status: "ok" });
    stopCapture();
    setMinLogLevel("info");
    expect(captured.join("")).toContain('"quiet-now"');
  });
});

// ==========================================================================
// ۴) پوشش‌های رایی
// ==========================================================================

describe("P2-05 — پوشش‌های رایی", () => {
  test("logAuth / logSync / logAgentCall / logRoute — دسته و عملیات درست", async () => {
    const { logAuth, logSync, logAgentCall, logRoute } = await import("@/lib/logger");

    startCapture();
    logAuth("otp-failed", { userId: "910001", status: "fail", errorCode: "OTP_INVALID" });
    let line = lastLogLine();
    expect(line.category).toBe("auth");
    expect(line.operation).toBe("otp-failed");
    expect(line.status).toBe("fail");
    expect(line.errorCode).toBe("OTP_INVALID");
    expect(line.userId).toBe("910001");
    expect(line.level).toBe("warn");
    stopCapture();

    startCapture();
    logSync("sync-run", { status: "ok", mode: "incremental", duration: 120 });
    line = lastLogLine();
    expect(line.category).toBe("sync");
    expect((line.detail as { mode: string }).mode).toBe("incremental");
    expect(line.duration).toBe(120);
    stopCapture();

    startCapture();
    logAgentCall({ tileId: "transactions", agentName: "ایجنت معاملات", operation: "render-insights", status: "ok", duration: 5 });
    line = lastLogLine();
    expect(line.category).toBe("agent");
    expect(line.tileId).toBe("transactions");
    expect(line.agentId).toBe("transactions");
    expect((line.detail as { agentName: string }).agentName).toBe("ایجنت معاملات");
    stopCapture();

    startCapture();
    logRoute({ method: "GET", path: "/api/health", status: "ok", httpStatus: 200, duration: 3 });
    line = lastLogLine();
    expect(line.category).toBe("route");
    expect(line.operation).toBe("GET /api/health");
    stopCapture();
  });
});

// ==========================================================================
// ۵) withRouteLog — پوشش کامل روت
// ==========================================================================

describe("P2-05 — withRouteLog", () => {
  test("پاسخ عیناً عبوری + دو رویداد start و ok با duration", async () => {
    const { withRouteLog } = await import("@/lib/logger");
    const inner = async (): Promise<Response> => {
      await new Promise((r) => setTimeout(r, 15));
      return Response.json({ ok: true, marker: "untouched" });
    };
    const wrapped = withRouteLog("test-route", inner);

    startCapture();
    const res = await wrapped(new Request("http://localhost/api/x"), undefined as never);
    stopCapture();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, marker: "untouched" });

    const lines = captured.join("").split("\n").filter((l) => l.includes('"route"'));
    expect(lines.length).toBe(2);
    const startLine = JSON.parse(lines[0]);
    const okLine = JSON.parse(lines[1]);
    expect(startLine.status).toBe("start");
    expect(okLine.status).toBe("ok");
    expect(okLine.duration).toBeGreaterThanOrEqual(10);
    expect((okLine.detail as { httpStatus: number }).httpStatus).toBe(200);
  });

  test("خطای handler → رویداد fail + duration، خطا بازپرتاب می‌شود", async () => {
    const { withRouteLog } = await import("@/lib/logger");
    const wrapped = withRouteLog("boom", async (): Promise<Response> => {
      throw new Error("boom");
    });

    startCapture();
    await expect(wrapped(new Request("http://localhost/api/y"), undefined as never)).rejects.toThrow("boom");
    stopCapture();

    const lines = captured.join("").split("\n").filter((l) => l.includes('"route"'));
    const failLine = JSON.parse(lines[lines.length - 1]);
    expect(failLine.status).toBe("fail");
    expect(failLine.errorCode).toBe("ROUTE_THROW");
  });
});

// ==========================================================================
// ۶) middleware — خط آغاز هر /api/*
// ==========================================================================

describe("P2-05 — proxy", () => {
  test("فراخوانی proxy برای /api/health → رویداد route status=start + پاسخ next", async () => {
    const { NextRequest } = await import("next/server");
    const proxyMod = await import("@/proxy");

    startCapture();
    const req = new NextRequest("http://localhost/api/health");
    const res = await proxyMod.default(req);
    stopCapture();

    expect(res).toBeDefined();
    const line = lastLogLine();
    expect(line.category).toBe("route");
    expect(line.status).toBe("start");
    expect(line.operation).toBe("GET /api/health");
  });
});

// ==========================================================================
// ۷) رویدادهای الزامی احراز هویت (یکپارچه با DB تست)
// ==========================================================================

describe("P2-05 — رویدادهای الزامی auth", () => {
  test("createSession → رویداد login (userId + role، بدون توکن)", async () => {
    const { createSession } = await import("@/lib/auth/session");
    startCapture();
    const { token } = await createSession(
      { personnelCode: "950001", displayName: "تست لاگر", role: "CONSULTANT" },
      { ip: "127.0.0.1" },
      null
    );
    stopCapture();
    createdSessions.push(token);

    const line = lastLogLine();
    expect(line.category).toBe("auth");
    expect(line.operation).toBe("login");
    expect(line.status).toBe("ok");
    expect(line.userId).toBe("950001");
    expect((line.detail as { role: string }).role).toBe("CONSULTANT");
    // هیچ توکنی در لاگ نیست
    expect(captured.join("")).not.toContain(token);
  });

  test("revokeSession → رویداد logout", async () => {
    const { createSession, revokeSession } = await import("@/lib/auth/session");
    const { token } = await createSession(
      { personnelCode: "950002", displayName: "تست خروج", role: "CONSULTANT" },
      { ip: "127.0.0.1" },
      null
    );
    createdSessions.push(token);

    startCapture();
    await revokeSession(token, "USER_LOGOUT");
    stopCapture();
    const line = lastLogLine();
    expect(line.operation).toBe("logout");
    expect(line.userId).toBe("950002");
    expect((line.detail as { reason: string }).reason).toBe("USER_LOGOUT");
  });
});

// ==========================================================================
// ۸) اسکنر audit-log-safety.sh
// ==========================================================================

describe("P2-05 — اسکنر audit-log-safety.sh", () => {
  test("پایگاه پاک → exit 0؛ فایل متخلف → exit 1؛ پس از حذف → exit 0", async () => {
    const { execSync } = await import("child_process");

    const clean = execSync("bash scripts/audit-log-safety.sh", { encoding: "utf8" } as never).toString();
    expect(clean).toContain("PASS");

    // کاشت نقض: کلید حساس + موبایل خام
    await Bun.write(
      "src/lib/__violation_probe__.ts",
      `import { logEvent } from "@/lib/logger";\nlogEvent({ category: "system", operation: "x", status: "ok", detail: { accessToken: "abc", note: "09141234567" } });\n`
    );
    let caught = false;
    try {
      execSync("bash scripts/audit-log-safety.sh", { stdio: "pipe" });
    } catch {
      caught = true;
    }
    expect(caught).toBe(true);

    await Bun.write("src/lib/__violation_probe__.ts", ""); // خالی
    const { unlink } = await import("fs/promises");
    await unlink("src/lib/__violation_probe__.ts");
    const again = execSync("bash scripts/audit-log-safety.sh", { encoding: "utf8" as never }).toString();
    expect(again).toContain("PASS");
  });
});
