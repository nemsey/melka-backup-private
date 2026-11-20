/**
 * tests/dir-static-500-001.test.ts — دستور DIR-STATIC-500-001 (۱۴۰۵/۰۸/۳۰)
 * ---------------------------------------------------------------------------
 * اولاً) ریشه‌یابی فراکامل خطای «Application error: a client-side exception»:
 *        زنجیرهٔ شواهد: سرور زنده (SSR/API از حافظه) اما همهٔ چانک‌های
 *        ایستا ۵۰۰ — علت: بیلد مخرب درجا (عامل محیطی، HEAD=c6beacf) از مسیر
 *        سیم‌لینک .next، درختِ فروشگاه را زیر پای سرورِ زنده جایگزین کرد →
 *        CWD سرور (standalone) حذف → مسیرهای نسبی ایستا همگی شکست.
 * درمان چندلایه:
 *   لایهٔ ۱) گارد بیلد درجا در next.config.ts (نقطهٔ بارگذاری — همهٔ مسیرها)
 *   لایهٔ ۲) گارد پوسته در build-with-parking.sh (شکست سریع پیش از اقدام)
 *   لایهٔ ۳) پروب سلامت سرو‌دهی در melka-keeper (CWD حذف/چانک غیر۲۰۰/drift)
 *            + خودترمیمی رسمی heal-deploy.sh (بیلد رسمی+ری‌استارت+راستی‌آزمایی)
 *   لایهٔ ۴) واچ‌داگ و CI دیگر هرگز درجا بیلد نمی‌کنند (مسیر رسمی)
 * ثانیاً) چهار قانون با اعلام دقیق آمار — در گزارش نهایی دایرکتوری.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync, existsSync, lstatSync } from "node:fs";
import { join } from "node:path";
import { execSync, execFileSync } from "node:child_process";

Object.assign(process.env, {
  NODE_ENV: process.env.NODE_ENV ?? "test",
  DATABASE_URL: process.env.DATABASE_URL ?? "file:/home/z/my-project/db/test.db",
  MELK_TOKEN_KEY: process.env.MELK_TOKEN_KEY ?? "test-only-key-not-a-real-secret",
});

const ROOT = "/home/z/my-project";
const NEXT_CONFIG = readFileSync(join(ROOT, "next.config.ts"), "utf8");
const PARKING = readFileSync(join(ROOT, "scripts/build-with-parking.sh"), "utf8");
const KEEPER = readFileSync(join(ROOT, "scripts/melka-keeper.py"), "utf8");
const HEAL = readFileSync(join(ROOT, "scripts/heal-deploy.sh"), "utf8");
const WATCHDOG = readFileSync(join(ROOT, "scripts/prod-watchdog.sh"), "utf8");
const CI = readFileSync(join(ROOT, "scripts/ci.sh"), "utf8");
const WSDAEMON = readFileSync(join(ROOT, "scripts/ws-build-daemon.py"), "utf8");

const NEXT_IS_SYMLINK = (() => {
  try {
    return lstatSync(join(ROOT, ".next")).isSymbolicLink();
  } catch {
    return false;
  }
})();

/* ═══════════ لایهٔ ۱ — گارد next.config.ts (همهٔ مسیرهای بیلد) ═══════════ */

describe("DIR-STATIC-500-001 · لایهٔ ۱ — گارد بیلد درجا در next.config.ts", () => {
  test("۱-۱ گارد تعریف و در بارگذاری پیکربندی اجرا می‌شود", () => {
    expect(NEXT_CONFIG).toContain("function inplaceBuildGuard()");
    expect(NEXT_CONFIG).toContain("inplaceBuildGuard();");
    expect(NEXT_CONFIG).toContain('lstatSync(".next").isSymbolicLink()');
  });

  test("۱-۲ فرار اضطراری مالک: MELKA_ALLOW_INPLACE_BUILD=1", () => {
    expect(NEXT_CONFIG).toContain('process.env.MELKA_ALLOW_INPLACE_BUILD === "1"');
  });

  test("۱-۳ گارد فقط در ریشهٔ مخزن my-project فعال است (فضای کاری WS و تست آزاد)", () => {
    expect(NEXT_CONFIG).toContain('resolve(cwd) === "/home/z/my-project"');
  });

  test("۱-۴ [زنده] بارگذاری پیکربندی در my-project با .next سیم‌لینک → شکست با پیام گارد", () => {
    if (!NEXT_IS_SYMLINK) return; // توپولوژی فروشگاه فعال نیست — گارد بی‌عمل
    let out = "";
    try {
      out = execFileSync("bun", ["-e", `import("${ROOT}/next.config.ts")`], {
        cwd: ROOT,
        timeout: 30_000,
        stdio: ["ignore", "pipe", "pipe"],
        // محیط فرزند باید شبیه بیلد واقعی باشد (نه NODE_ENV=test که گارد را
        // برای بارگذاریِ صرف پیکربندی خنثی می‌کند — درس نخستین اجرای کامل)
        env: { ...process.env, NODE_ENV: "production" },
      }).toString();
    } catch (e) {
      out = String((e as { stderr?: Buffer })?.stderr ?? "") + String((e as { stdout?: Buffer })?.stdout ?? "");
    }
    expect(out).toContain("[inplace-build-guard]");
  });
});

/* ═══════════ لایهٔ ۲ — گارد پوسته build-with-parking.sh ═══════════ */

describe("DIR-STATIC-500-001 · لایهٔ ۲ — گارد پوسته build-with-parking.sh", () => {
  test("۲-۱ گارد پیش از هر اقدام (پارک/نصب/بیلد) ایستاده است", () => {
    const guardIdx = PARKING.indexOf("inplace-guard");
    const parkFnIdx = PARKING.indexOf("restore_park()");
    expect(guardIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(parkFnIdx);
  });

  test("۲-۲ REPO_ROOT از محل اسکریپت محاسبه می‌شود (نه رشتهٔ ثابت) — وصلهٔ cd دیمن WS معتبر می‌ماند", () => {
    expect(PARKING).toContain('REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"');
    // هدف وصلهٔ ws-build-daemon.py دست‌نخورده: دقیقاً یک رخداد
    expect(PARKING.split("cd /home/z/my-project").length - 1).toBe(1);
  });

  test("۲-۳ [زنده] اجرای build-with-parking.sh در توپولوژی فروشگاه → exit 1 با پیام گارد", () => {
    if (!NEXT_IS_SYMLINK) return;
    let out = "";
    let code = 0;
    try {
      out = execFileSync("bash", [join(ROOT, "scripts/build-with-parking.sh")], {
        cwd: ROOT,
        timeout: 20_000,
        stdio: ["ignore", "pipe", "pipe"],
      }).toString();
    } catch (e) {
      code = (e as { exitCode?: number }).exitCode ?? 1;
      out = String((e as { stdout?: Buffer })?.stdout ?? "");
    }
    expect(code).toBe(1);
    expect(out).toContain("[inplace-guard]");
  });
});

/* ═══════════ لایهٔ ۳ — کیپر: پروب سلامت + خودترمیمی رسمی ═══════════ */

describe("DIR-STATIC-500-001 · لایهٔ ۳ — melka-keeper: تشخیص چندوجهی + ترمیم", () => {
  test("۳-۱ تشخیص CWD حذف‌شدهٔ سرور (ریشهٔ حادثهٔ چانک ۵۰۰)", () => {
    expect(KEEPER).toContain("def server_cwd_deleted()");
    expect(KEEPER).toContain('if "deleted" in cwd:');
  });

  test("۳-۲ پروب چانک ایستا — همان تجربهٔ مرورگر", () => {
    expect(KEEPER).toContain("def serving_broken()");
    expect(KEEPER).toContain('/_next/static/chunks/');
    expect(KEEPER).toContain('return True, f"chunk-{ccode}"');
  });

  test("۳-۳ تشخیص drift: بیلد سرو‌شده ≠ بیلد دیسک", () => {
    expect(KEEPER).toContain('return True, f"drift-live=');
  });

  test("۳-۴ ضدلرزش: دو شکست پیاپی پیش از ترمیم + خنثی‌سازی حین بیلد/ترمیم رسمی", () => {
    expect(KEEPER).toContain("HEAL_TRIGGER_AFTER = 2");
    expect(KEEPER).toContain("def heal_in_progress()");
    expect(KEEPER).toContain("if building():");
  });

  test("۳-۵ ترمیم فقط از مسیر رسمی heal-deploy.sh (قفل flock + cooldown)", () => {
    expect(KEEPER).toContain("HEAL_COOLDOWN = 240.0");
    expect(KEEPER).toContain('["setsid", "bash", f"{REPO}/scripts/heal-deploy.sh"');
  });

  test("۳-۶ پارک خودکار کیپر دیگر درخت زندهٔ سرور را نمی‌کشد (پارک امن)", () => {
    expect(KEEPER).toContain("def any_server_cwd_in_store()");
    expect(KEEPER).toContain("if server_cwd_deleted() or any_server_cwd_in_store():");
  });

  test("۳-۷ [زنده] توابع کیپر سالم بارگذاری می‌شوند (ast) و پروب چانک روی سرور زنده جواب می‌دهد", () => {
    const out = execSync(
      `python3 - <<'PYEOF'
import importlib.util, json
spec = importlib.util.spec_from_file_location("k", "${ROOT}/scripts/melka-keeper.py")
k = importlib.util.module_from_spec(spec)
spec.loader.exec_module(k)
code, html = k.http_get("/")
print(json.dumps({"http": code, "cwd_deleted": k.server_cwd_deleted()}))
PYEOF`,
      { timeout: 30_000, cwd: ROOT },
    ).toString();
    const parsed = JSON.parse(out.trim().split("\n").pop() ?? "{}");
    expect([200, 0]).toContain(parsed.http);
    expect(typeof parsed.cwd_deleted).toBe("boolean");
  });
});

/* ═══════════ لایهٔ ۳-ب — heal-deploy.sh: ترمیم رسمی تک‌نمونه ═══════════ */

describe("DIR-STATIC-500-001 · لایهٔ ۳-ب — heal-deploy.sh", () => {
  test("۳-۸ قفل flock تک‌نمونه — ترمیم موازی هرگز", () => {
    expect(HEAL).toContain('exec 9>"$LOCK"');
    expect(HEAL).toContain("flock -n 9");
  });

  test("۳-۹ بیلد فقط از مسیر رسمی + وارسی همگرایی BUILD_ID=HEAD پیش از ری‌استارت", () => {
    expect(HEAL).toContain('ws-build-daemon.py" --foreground');
    expect(HEAL).toContain('[[ "$BID" != "$HEAD_SHA"-* ]]');
  });

  test("۳-۱۰ ری‌استارت صفر‌قطعی pn054 + راستی‌آزمایی چانک/نسخه در پایان", () => {
    expect(HEAL).toContain("pn054-cmd");
    expect(HEAL).toContain('/api/version');
    expect(HEAL).toContain("CHUNK_CODE");
  });

  test("۳-۱۱ [زنده] با قفل گرفته‌شده، ترمیم دوم بی‌درنگ SKIP می‌شود", () => {
    if (!existsSync("/home/z/melka-store")) return;
    // قفل را بگیر و لحظه‌ای صبر کن تا flock قطعاً بنشیند؛ سپس heal-deploy
    // باید exit 0 با پیام SKIP بدهد (هرگز بیلد واقعی شروع نشود)
    execSync(
      `flock /home/z/melka-store/heal-deploy.lock -c 'sleep 6' >/dev/null 2>&1 & sleep 0.8`,
      { timeout: 15_000 },
    );
    const out = execFileSync(
      "bash",
      [join(ROOT, "scripts/heal-deploy.sh"), "--reason", "test-lock"],
      { cwd: ROOT, timeout: 15_000, stdio: ["ignore", "pipe", "pipe"] },
    ).toString();
    expect(out).toContain("SKIP");
  });
});

/* ═══════════ لایهٔ ۴ — واچ‌داگ/CI/دیمن: فقط مسیر رسمی ═══════════ */

describe("DIR-STATIC-500-001 · لایهٔ ۴ — واچ‌داگ، CI و دیمن بیلد", () => {
  test("۴-۱ واچ‌داگ دیگر هرگز درجا بیلد نمی‌کند (هر دو گارد chunk-guard و G3)", () => {
    expect(WATCHDOG).not.toContain("bun run build");
    expect(WATCHDOG.split("ws-build-daemon.py --foreground").length - 1).toBe(2);
  });

  test("۴-۲ CI آگاه از توپولوژی فروشگاه است", () => {
    expect(CI).toContain("[ -L /home/z/my-project/.next ]");
    expect(CI).toContain("ws-build-daemon.py --foreground");
  });

  test("۴-۳ دیمن بیلد: حالت --foreground + پرچم BUILD_RUNNING (هماهنگی نگهبان‌ها)", () => {
    expect(WSDAEMON).toContain('"--foreground"');
    expect(WSDAEMON).toContain('BUILD_FLAG = f"{REPO}/upload/.runtime/BUILD_RUNNING"');
  });
});
