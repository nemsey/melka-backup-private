/**
 * تست‌های P6519 — شاهد زندهٔ نسخه (دستور شورا: رفع دائمی لینک‌های کهنه)
 * -------------------------------------------------------------------------
 * زمینه (docs/diagnosis-preview-publish-stale.md): تغییر بدون شاهد زنده =
 * تغییر نکرده. این تست‌ها شش لایهٔ شاهد را قفل می‌کنند:
 *
 *  A) BUILD_ID خودکار در next.config (generateBuildId + env پخته‌شده)
 *  B) getBuildWitness — حالت baked (production) و dev-live + memoization + قالب SW-safe
 *  C) GET /api/version — قرارداد ۷ کلیدی + no-store + بدون احراز هویت
 *  D) متاتگ app-build-id در layout (شاهد HTML خام بدون لاگین)
 *  E) فوتر UI — VersionBadge با data-testid و زنجیرهٔ fallback
 *  F) ثبت DB — AppMeta singleton با upsert idempotent
 *  G) Service Worker — نسخه‌بندی کش با BUILD_ID + skipWaiting/claim + سینتکس معتبر
 */

import { describe, expect, test, beforeAll, afterAll } from "bun:test";

const ENV_BACKUP: Record<string, string | undefined> = {};
const WATCHED_KEYS = [
  "NEXT_PUBLIC_BUILD_ID",
  "NEXT_PUBLIC_GIT_SHA",
  "NEXT_PUBLIC_BUILT_AT",
] as const;

/** الگوی امن SW — buildId باید همیشه در این الگو بگنجد تا SW آن را بپذیرد */
const SW_SAFE = /^[A-Za-z0-9_.-]{1,64}$/;
const BAKED_ID = "abcd1234-20260924-0712";

function setEnv(key: string, value: string | undefined) {
  if (!(key in ENV_BACKUP)) ENV_BACKUP[key] = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

beforeAll(() => {
  for (const k of WATCHED_KEYS) setEnv(k, process.env[k]);
});

afterAll(() => {
  for (const [k, v] of Object.entries(ENV_BACKUP)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("P6519-A — BUILD_ID خودکار در next.config", () => {
  test("A-1) generateBuildId تابع است (BUILD_ID تصادفی پیش‌فرض Next غیرفعال شده)", async () => {
    const configModule = await import("../next.config");
    const cfg = (configModule.default ?? configModule) as { generateBuildId?: unknown };
    expect(typeof cfg.generateBuildId).toBe("function");
  });

  test("A-2) سه متغیر نسخه در env کانفیگ پخته می‌شوند", async () => {
    const configModule = await import("../next.config");
    const cfg = (configModule.default ?? configModule) as { env?: Record<string, string> };
    expect(cfg.env).toBeDefined();
    expect(Object.keys(cfg.env ?? {})).toContain("NEXT_PUBLIC_BUILD_ID");
    expect(Object.keys(cfg.env ?? {})).toContain("NEXT_PUBLIC_GIT_SHA");
    expect(Object.keys(cfg.env ?? {})).toContain("NEXT_PUBLIC_BUILT_AT");
  });

  test("A-3) مقدار تولیدی generateBuildId = «<sha>-<yyyymmdd>-<hhmm>» و SW-safe", async () => {
    const configModule = await import("../next.config");
    const cfg = (configModule.default ?? configModule) as { generateBuildId?: () => string | Promise<string> };
    const id = await cfg.generateBuildId!();
    expect(id).toMatch(/^[0-9a-f]{7,8}-\d{8}-\d{4}$/);
    expect(id).toMatch(SW_SAFE);
    // sha باید به کامیت فعلی گره بخورد (نه nogit — در ریپوی زنده git موجود است)
    expect(id.startsWith("nogit-")).toBe(false);
  });

  test("A-4) /api/version در هدرهای no-store کانفیگ هست (مهار کش لایهٔ FC)", async () => {
    const configModule = await import("../next.config");
    const cfg = (configModule.default ?? configModule) as { headers?: () => Promise<Array<{ source: string; headers: Array<{ key: string; value: string }> }>> };
    const rules = await cfg.headers!();
    const versionRule = rules.find((r) => r.source === "/api/version");
    expect(versionRule).toBeDefined();
    expect(versionRule!.headers.some((h) => h.key === "Cache-Control" && h.value.includes("no-store"))).toBe(true);
  });
});

describe("P6519-B — getBuildWitness (منبع واحد شاهد)", () => {
  test("B-1) بدون env پخته‌شده: dev-live با پیشوند dev- و sha واقعی", async () => {
    const mod = await import("@/lib/build-witness");
    mod.__resetBuildWitnessCacheForTests();
    setEnv("NEXT_PUBLIC_BUILD_ID", undefined);
    setEnv("NEXT_PUBLIC_GIT_SHA", undefined);
    setEnv("NEXT_PUBLIC_BUILT_AT", undefined);

    const w = mod.getBuildWitness();
    expect(w.source).toBe("dev-live");
    expect(w.buildId.startsWith("dev-")).toBe(true);
    expect(w.gitSha).toMatch(/^[0-9a-f]{7,8}$|^nogit$/);
    expect(w.builtAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(w.buildId).toMatch(SW_SAFE);
  });

  test("B-2) با env پخته‌شده (production): عین مقادیر build برمی‌گردد", async () => {
    const mod = await import("@/lib/build-witness");
    mod.__resetBuildWitnessCacheForTests();
    setEnv("NEXT_PUBLIC_BUILD_ID", BAKED_ID);
    setEnv("NEXT_PUBLIC_GIT_SHA", "abcd1234");
    setEnv("NEXT_PUBLIC_BUILT_AT", "2026-09-24T07:12:00.000Z");

    const w = mod.getBuildWitness();
    expect(w.source).toBe("baked");
    expect(w.buildId).toBe(BAKED_ID);
    expect(w.gitSha).toBe("abcd1234");
    expect(w.builtAt).toBe("2026-09-24T07:12:00.000Z");
  });

  test("B-3) memoization — فراخوانی دوم همان شیء کش‌شده را می‌دهد", async () => {
    const mod = await import("@/lib/build-witness");
    const w1 = mod.getBuildWitness();
    const w2 = mod.getBuildWitness();
    expect(w1).toBe(w2);
    mod.__resetBuildWitnessCacheForTests();
  });

  test("B-4) مقدار baked هرگز با قالب SW سازگاری را نمی‌شکند (قرارداد SW ↔ شاهد)", async () => {
    const mod = await import("@/lib/build-witness");
    mod.__resetBuildWitnessCacheForTests();
    setEnv("NEXT_PUBLIC_BUILD_ID", "Zz9_yA.-x12-20260101-0000"); // بدترین حالت مجاز
    setEnv("NEXT_PUBLIC_GIT_SHA", "Zz9_yA.-x12");
    setEnv("NEXT_PUBLIC_BUILT_AT", "2026-01-01T00:00:00.000Z");
    expect(mod.getBuildWitness().buildId).toMatch(SW_SAFE);
  });
});

describe("P6519-C — GET /api/version (قرارداد شاهد ماشینی)", () => {
  test("C-1) پاسخ ۲۰۰ با هر ۷ کلید قرارداد", async () => {
    setEnv("NEXT_PUBLIC_BUILD_ID", undefined);
    setEnv("NEXT_PUBLIC_GIT_SHA", undefined);
    setEnv("NEXT_PUBLIC_BUILT_AT", undefined);
    const { GET } = await import("@/app/api/version/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    for (const key of ["buildId", "builtAt", "gitSha", "env", "source", "runtime", "serverTime"]) {
      expect(key in body).toBe(true);
    }
  });

  test("C-2) هدر no-store — هرگز توسط CDN/مرورگر کش نمی‌شود", async () => {
    const { GET } = await import("@/app/api/version/route");
    const res = await GET();
    expect(res.headers.get("Cache-Control")).toContain("no-store");
  });

  test("C-3) بدون احراز هویت — route اصلاً هیچ ورودی/توکنی نمی‌خواهد", async () => {
    const { GET } = await import("@/app/api/version/route");
    // امضای GET = صفر آرگومان ⇒ هیچ هدر احراز هویتی تعریف‌نشده است (عمومی عمدی)
    expect(GET.length).toBe(0);
    const res = await GET();
    expect(res.status).toBe(200);
  });

  test("C-4) buildId پاسخ‌شده SW-safe است (قابل استفاده در نام کش)", async () => {
    const { GET } = await import("@/app/api/version/route");
    const body = (await (await GET()).json()) as { buildId: string };
    expect(body.buildId).toMatch(SW_SAFE);
  });
});

describe("P6519-D — متاتگ app-build-id در layout (شاهد HTML خام)", () => {
  test("D-1) layout از شاهد بیلد استفاده می‌کند و متا را می‌سازد", async () => {
    const src = await Bun.file("src/app/layout.tsx").text();
    expect(src).toContain("app-build-id");
    expect(src).toContain("app-git-sha");
    expect(src).toContain("getBuildWitness");
  });

  test("D-2) metadata.other مقادیر شاهد زنده را دارد", async () => {
    // کش شاهد را ریست + sha معتبر ۸-نویسه‌ای بگذار (layout در زمان import می‌خواند)
    const mod = await import("@/lib/build-witness");
    mod.__resetBuildWitnessCacheForTests();
    setEnv("NEXT_PUBLIC_BUILD_ID", "abcd1234-20260924-0712");
    setEnv("NEXT_PUBLIC_GIT_SHA", "abcd1234");
    setEnv("NEXT_PUBLIC_BUILT_AT", "2026-09-24T07:12:00.000Z");
    const layout = await import("@/app/layout");
    const meta = layout.metadata as { other?: Record<string, string> };
    expect(meta.other?.["app-build-id"]).toBe("abcd1234-20260924-0712");
    expect(meta.other?.["app-git-sha"]).toBe("abcd1234");
    mod.__resetBuildWitnessCacheForTests();
  });
});

describe("P6519-E — فوتر UI (شاهد چشمی مالک)", () => {
  test("E-1) DashboardHome از VersionBadge استفاده می‌کند (نسخهٔ هاردکد حذف شده)", async () => {
    const src = await Bun.file("src/components/app/DashboardHome.tsx").text();
    expect(src).toContain("import { VersionBadge } from \"./VersionBadge\"");
    expect(src).toContain("<VersionBadge />");
    // نسخهٔ هاردکد قدیمی حذف شده — از این پس نسخه از /api/version زنده می‌آید
    expect(src.includes("نسخه ۱٫۷٫۰")).toBe(false);
  });

  test("E-2) VersionBadge: fetch از /api/version + testid + fallback باندل", async () => {
    const src = await Bun.file("src/components/app/VersionBadge.tsx").text();
    expect(src).toContain('"/api/version"');
    expect(src).toContain('data-testid="live-build-id"');
    expect(src).toContain("NEXT_PUBLIC_BUILD_ID");
  });
});

describe("P6519-F — ثبت DB (AppMeta singleton)", () => {
  test("F-1) recordBuildWitnessToDb رکورد singleton را می‌سازد", async () => {
    setEnv("NEXT_PUBLIC_BUILD_ID", BAKED_ID);
    setEnv("NEXT_PUBLIC_GIT_SHA", "abcd1234");
    setEnv("NEXT_PUBLIC_BUILT_AT", "2026-09-24T07:12:00.000Z");
    const { db } = await import("@/lib/db");
    const { recordBuildWitnessToDb, __resetBuildWitnessCacheForTests } = await import("@/lib/build-witness");
    __resetBuildWitnessCacheForTests();

    await recordBuildWitnessToDb(db);
    const row = await db.appMeta.findUnique({ where: { id: "singleton" } });
    expect(row).not.toBeNull();
    expect(row!.buildId).toBe(BAKED_ID);
    expect(row!.gitSha).toBe("abcd1234");
    expect(row!.env).toBeTypeOf("string");
    expect(row!.builtAt).toBe("2026-09-24T07:12:00.000Z");
  });

  test("F-2) idempotent — اجرای دوم به‌روزرسانی است، نه رکورد جدید", async () => {
    setEnv("NEXT_PUBLIC_BUILD_ID", "ffee5678-20260924-0800");
    setEnv("NEXT_PUBLIC_GIT_SHA", "ffee5678");
    setEnv("NEXT_PUBLIC_BUILT_AT", "2026-09-24T08:00:00.000Z");
    const { db } = await import("@/lib/db");
    const { recordBuildWitnessToDb, __resetBuildWitnessCacheForTests } = await import("@/lib/build-witness");
    __resetBuildWitnessCacheForTests();

    await recordBuildWitnessToDb(db);
    const count = await db.appMeta.count();
    expect(count).toBe(1);
    const row = await db.appMeta.findUnique({ where: { id: "singleton" } });
    expect(row!.buildId).toBe("ffee5678-20260924-0800");
  });

  test("F-3) مدل AppMeta در اسکیمای Prisma موجود است (الزام app_meta شورا)", async () => {
    const schema = await Bun.file("prisma/schema.prisma").text();
    expect(schema).toContain("model AppMeta");
    expect(schema).toContain("buildId");
    expect(schema).toContain("builtAt");
  });
});

describe("P6519-G — Service Worker (نسخه‌بندی کش با BUILD_ID)", () => {
  test("G-1) نام کش بر پایهٔ BUILD_ID زندهٔ /api/version ساخته می‌شود", async () => {
    const sw = await Bun.file("public/sw.js").text();
    expect(sw).toContain('BASE_VERSION = "melk-dash-v7"');
    expect(sw).toContain('"/api/version"');
    expect(sw).toContain("ensureVersionResolved()");
  });

  test("G-2) گارد اعتبارسنجی buildId قبل از ساخت نام کش (الگوی SW-safe)", async () => {
    const sw = await Bun.file("public/sw.js").text();
    expect(sw).toContain("/^[A-Za-z0-9_.-]{1,64}$/");
  });

  test("G-3) skipWaiting + clients.claim + پاکسازی کش‌های قدیمی حفظ شده", async () => {
    const sw = await Bun.file("public/sw.js").text();
    expect(sw).toContain("self.skipWaiting()");
    expect(sw).toContain("self.clients.claim()");
    expect(sw).toContain("caches.delete(k)");
  });

  test("G-4) HTML همچنان هرگز کش نمی‌شود (network-first دست‌نخورده)", async () => {
    const sw = await Bun.file("public/sw.js").text();
    expect(sw).toContain("HTML هرگز کش نمی‌شود");
    expect(sw).toContain('url.pathname.startsWith("/api/")');
  });

  test("G-5) سینتکس sw.js معتبر است (node --check)", () => {
    const proc = Bun.spawnSync(["node", "--check", "public/sw.js"]);
    expect(proc.exitCode).toBe(0);
  });
});

describe("P6519-H — instrumentation (ثبت شاهد در بوت سرور)", () => {
  test("H-1) بوت سرور شاهد بیلد را در DB ثبت می‌کند + لاگ می‌زند", async () => {
    const src = await Bun.file("src/instrumentation.ts").text();
    expect(src).toContain("recordBuildWitnessToDb");
    expect(src).toContain("build-witness");
    expect(src).toContain('"build-witness"');
  });

  test("H-2) fail-safe: ثبت DB هرگز بوت را نمی‌شکند (بدون throw بیرونی)", async () => {
    const src = await Bun.file("src/lib/build-witness.ts").text();
    // recordBuildWitnessToDb باید try/catch داشته باشد
    expect(src).toContain("await db.appMeta.upsert");
    const fnStart = src.indexOf("export async function recordBuildWitnessToDb");
    const fnEnd = src.indexOf("}", src.lastIndexOf("}"));
    const body = src.slice(fnStart, fnEnd);
    expect(body).toContain("catch");
  });
});
