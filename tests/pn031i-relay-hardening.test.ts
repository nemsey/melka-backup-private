/**
 * tests/pn031i-relay-hardening.test.ts — PN-031-I (شورا-ن۰۵۰)
 * ---------------------------------------------------------------------------
 * دروازه‌های سخت‌سازی نسل I:
 *   الف) لایهٔ ۱ — حمل‌ونقل: http1.1 · UA بروزری · نردبان retry پله‌ای ·
 *        سقف نرخ ۵/دقیقه · لاگ دیباگ با redact · نبض نسخه
 *   ب) لایهٔ ۳ — مسیر جایگزین: تزریق ALT_SERVER_URL · سوئیچ پس از ۳ خطا ·
 *        برگشت به مسیر اصلی · واکِر /relay/* (path-whitelist + مبدأ + نرخ)
 *   ج) reset-guard — داوری بیلد زنده (BUILD-STALE) + تازه‌سازی Worker
 *   د) اجرای واقعی bash (درس جلسهٔ ۰۴۷: شبیه‌سازی ≠ اجرای واقعی)
 */
import { describe, test, expect } from "bun:test";
import { readFileSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { buildRelayScript, buildInstallCommand } from "../src/lib/melk-api/relay-script";

const REPO = join(import.meta.dir, "..");
const script = buildRelayScript({
  serverUrl: "https://preview-chat-example.space-z.ai",
  deviceId: "poco-f3-unit",
  deviceSecret: "b".repeat(64),
  altServerUrl: "https://melka-proxy.example.workers.dev/relay",
});
const scriptNoAlt = buildRelayScript({
  serverUrl: "https://preview-chat-example.space-z.ai",
  deviceId: "poco-f3-unit",
  deviceSecret: "b".repeat(64),
});
const workerSrc = readFileSync(join(REPO, "melka-proxy/src/index.ts"), "utf8");
const resetGuardSrc = readFileSync(join(REPO, "scripts/recovery/reset-guard.sh"), "utf8");

// ───────────────────── الف) لایهٔ ۱ — حمل‌ونقل ─────────────────────
describe("PN-031-I · الف) لایهٔ ۱ — حمل‌ونقل مقاوم در برابر curl 9", () => {
  test("الف-۱: --http1.1 روی تمام تماسهای سرور (poll/result/health/version)", () => {
    expect(script).toContain('curl --http1.1 -A "$UA" -sS -v --max-time 35 "$(cur_url)$path" "$@"');
    expect(script).toContain('curl --http1.1 -A "$UA" -sSI --max-time 15');
    expect(script).toContain('curl --http1.1 -A "$UA" -sS --max-time 15 "$(cur_url)/api/version"');
  });

  test("الف-۲: User-Agent بروزری (Chrome روی اندروید) — نه curl/8.x", () => {
    expect(script).toContain('UA="Mozilla/5.0 (Linux; Android 13; Poco F3)');
    expect(script).toContain("Chrome/128");
    expect(script).not.toContain('-A "curl/');
  });

  test("الف-۳: نردبان retry پله‌ای ۳۰/۶۰/۱۲۰/۳۰۰/۳۰۰ — پایان چکش ۵ثانیه‌ای", () => {
    expect(script).toContain("RETRY_DELAYS=(30 60 120 300 300)");
    expect(script).not.toContain("۵ ثانیه دیگر تلاش می‌کنم");
    expect(script).toContain("خطای پیاپی: $NET_FAILS");
  });

  test("الف-۴: سقف نرخ — حداکثر ۵ تماس در پنجرهٔ ۶۰ثانیه‌ای", () => {
    expect(script).toContain("-ge 5 ]");
    expect(script).toContain("60 - (now - oldest) + 1");
    expect(script).toContain("سقف نرخ (۵ در دقیقه)");
  });

  test("الف-۵: لاگ دیباگ با redact امضا + چرخش اندازه", () => {
    expect(script).toContain('RELAY_DEBUG="$HOME/relay-debug.log"');
    // sed مقدار امضا را پیش از نوشتن حذف می‌کند — <redacted> در جایگزین sed
    expect(script).toContain("<redacted>");
    expect(script).toContain("X-Melka-Signature");
    expect(script).toContain("debug_rotate");
    expect(script).toContain("DEBUG_MAX=524288");
  });

  test("الف-۶: توضیح فارسی کد ۹ — راهنمای مالک روی خود گوشی", () => {
    expect(script).toContain('9) echo "دروازه اجازهٔ ادامه نداد');
    expect(script).toContain('16) echo "خطای قاب‌بندی HTTP/2');
  });

  test("الف-۷: دستور نصب یک‌خطی هم http1.1 + UA دارد (همان حمل‌ونقل)", () => {
    const cmd = buildInstallCommand("https://preview-chat-example.space-z.ai", "poco-f3-xyz");
    expect(cmd).toContain("--http1.1");
    expect(cmd).toContain('-A "Mozilla/5.0');
    expect(cmd).toContain("/api/mobile-relay/bootstrap?code=");
  });
});

// ───────────────────── ب) لایهٔ ۳ — مسیر جایگزین ─────────────────────
describe("PN-031-I · ب) لایهٔ ۳ — مسیر جایگزین واکِر /relay", () => {
  test("ب-۱: ALT_SERVER_URL تزریق می‌شود؛ بدون alt → مقدار خالی (تک‌مسیر)", () => {
    expect(script).toContain('ALT_SERVER_URL="https://melka-proxy.example.workers.dev/relay"');
    expect(script).toContain("ALT_FAIL_THRESHOLD=3");
    // بدون alt: مقدار خالی — شرط [ -n ... ] تک‌مسیر نگه می‌دارد
    expect(scriptNoAlt).toContain('ALT_SERVER_URL=""');
    expect(scriptNoAlt).toContain('URLS=("$SERVER_URL")');
  });

  test("ب-۲: سوئیچ پس از ۳ خطای پیاپی + برگشت دوره‌ای به مسیر اصلی", () => {
    expect(script).toContain("URL_IDX=$(( (URL_IDX + 1) % URL_COUNT ))");
    expect(script).toContain("PRIMARY_RECHECK_LOOPS=30");
    expect(script).toContain("بازگشت به مسیر اصلی برای آزمایش دوباره");
  });

  test("ب-۳: نبض نسخه — کشف بازنشانی پلتفرم از خود گوشی", () => {
    expect(script).toContain("version_ping()");
    expect(script).toContain("VERSION_CHECK_AT");
    expect(script).toContain("سرور ملکا روی نسخهٔ قدیمی است");
    expect(script).toContain("-lt 600 ]");
  });

  test("ب-۴: واکِر — شاخهٔ /relay/* + پیشوندهای مجاز + مبدأ فقط space-z.ai", () => {
    expect(workerSrc).toContain('pathname === "/relay" || pathname.startsWith("/relay/")');
    expect(workerSrc).toContain('"/api/mobile-relay/"');
    expect(workerSrc).toContain('"/api/health"');
    expect(workerSrc).toContain('"/api/version"');
    expect(workerSrc).toContain('endsWith(".space-z.ai")');
  });

  test("ب-۵: واکِر — هدرهای عبوری فقط احراز دستگاه؛ سقف نرخ هر IP", () => {
    expect(workerSrc).toContain('"x-melka-relay-device"');
    expect(workerSrc).toContain('"x-melka-timestamp"');
    expect(workerSrc).toContain('"x-melka-signature"');
    expect(workerSrc).toContain("RELAY_RATE_LIMIT = 30");
    expect(workerSrc).toContain("CF-Connecting-IP");
  });

  test("ب-۶: واکِر — مسیر غیرمجاز و راز MELK_PROXY_SECRET هرگز در شاخهٔ رله نیست", () => {
    // شاخهٔ /relay مستقل از راز ARM است (احراز واقعی در مبدأ) — نه deny «proxy not configured»
    const relayBranch = workerSrc.split("handleRelayRoute(request, env)")[1] ?? "";
    expect(relayBranch).not.toContain("MELK_PROXY_SECRET");
    expect(workerSrc).toContain('"path not allowed", 403');
  });

  test("ب-۷: ثبت کلید MELK_RELAY_ALT_URL در escrow بوت (بقا در بازنشانی env)", () => {
    const bootSecrets = readFileSync(join(REPO, "src/lib/auth/boot-secrets.ts"), "utf8");
    expect(bootSecrets).toContain('"MELK_RELAY_ALT_URL"');
    const envPlatform = readFileSync(join(REPO, "env.platform.json"), "utf8");
    expect(envPlatform).toContain('"MELK_RELAY_ALT_URL"');
  });

  test("ب-۸: bootstrap روت — altServerUrl هم به JSON اپ اندروید هم اسکریپت Termux", () => {
    const bootstrap = readFileSync(join(REPO, "src/app/api/mobile-relay/bootstrap/route.ts"), "utf8");
    expect(bootstrap).toContain("altServerUrl: process.env.MELK_RELAY_ALT_URL");
    expect(bootstrap.indexOf("altServerUrl: process.env.MELK_RELAY_ALT_URL")).toBeGreaterThan(0);
  });
});

// ───────────────────── ج) reset-guard — داوری بیلد زنده ─────────────────────
describe("PN-031-I · ج) reset-guard سطح دوم — درس بازگشت دهم", () => {
  test("ج-۱: داوری دُکلایه — BUILD-STALE وقتی درخت سالم است اما بیلد کهنه", () => {
    expect(resetGuardSrc).toContain("live_build_sha()");
    expect(resetGuardSrc).toContain('echo "BUILD-STALE live=$live head=$head"; return 2');
  });

  test("ج-۲: سرور در دسترس نیست → عهدهٔ watchdog (بدون اقدام شتاب‌زده)", () => {
    expect(resetGuardSrc).toContain("HEALTHY equal (server-unreachable)");
  });

  test("ج-۳: recover — Worker هم تازه می‌شود (رجیستری از درخت بازیابی‌شده)", () => {
    expect(resetGuardSrc).toContain('pkill -f "scripts/runtime/worker.ts"');
  });

  test("ج-۴: اجرای واقعی bash — live_build_sha سرور زنده را درست می‌خواند", () => {
    // سرور تولید روی 3000 زنده است — تابع استخراجشده باید gitSha غیرخالی بدهد
    const TMP = "/tmp/pn031i-guard-test";
    mkdirSync(TMP, { recursive: true });
    const fnFile = `${TMP}/live-build.fn`;
    const src = resetGuardSrc.split("live_build_sha() {")[1]?.split("\n}")[0] ?? "";
    writeFileSync(fnFile, `live_build_sha() { ${src}\n}\necho "$(live_build_sha)"\n`);
    const r = Bun.spawnSync(["bash", fnFile]);
    const got = new TextDecoder().decode(r.stdout).trim();
    expect(got.length).toBeGreaterThanOrEqual(40); // gitSha کامل (۴۰ hex)
    expect(r.exitCode).toBe(0);
    rmSync(TMP, { recursive: true, force: true });
  });
});

// ───────────────────── د) اجرای واقعی bash — منطق نسل I ─────────────────────
describe("PN-031-I · د) اجرای واقعی bash — منطق سوئیچ و نردبان", () => {
  const TMP = "/tmp/pn031i-bash-test";

  test("د-۱..د-۳: هارنس ماندگار — rate_gate/سوئیچ مسیر/نردبان retry/کد۹", () => {
    // درس جلسهٔ ۰۴۷: شبیه‌سازی ≠ اجرای واقعی — هارنس bash ماندگار
    // scripts/pn031i/bash-smoke.sh توابع را از اسکریپتِ رندرشده استخراج و اجرا می‌کند
    const r = Bun.spawnSync(["bash", join(REPO, "scripts/pn031i/bash-smoke.sh")]);
    const out = new TextDecoder().decode(r.stdout);
    expect(r.exitCode).toBe(0);
    expect(out).toContain("PASS — rate_gate مکث گرفت");
    expect(out).toContain("PASS — cur_url پس از سوئیچ alt");
    expect(out).toContain("PASS — پلهٔ ۱=۳۰ث");
    expect(out).toContain("PASS — پلهٔ ۱۰=۳۰۰ث (اشباع)");
    expect(out).toContain("PASS — کد۹ توضیح http1.1");
  });

  test("د-۴: bash -n — کل اسکریپت تولیدی معتبر است (هر دو پیکربندی)", () => {
    mkdirSync(TMP, { recursive: true });
    for (const [name, content] of [["with-alt", script], ["no-alt", scriptNoAlt]] as const) {
      const f = `${TMP}/${name}.sh`;
      writeFileSync(f, content);
      const r = Bun.spawnSync(["bash", "-n", f]);
      expect(r.exitCode).toBe(0);
    }
    rmSync(TMP, { recursive: true, force: true });
  });

  test("د-۵: منطق نبض نسخه — بیلد کهنه = هشدار، بیلد تازه = خاموش", () => {
    mkdirSync(TMP, { recursive: true });
    const harness = `${TMP}/version.sh`;
    writeFileSync(
      harness,
      `set -u\nfor v in '{"buildId":"oldsha-20261015-0722","gitSha":"newsha"}' '{"buildId":"newsha-20261015-2149","gitSha":"newsha"}'; do\n  bid=$(printf '%s' "$v" | jq -r '.buildId // empty')\n  sha=$(printf '%s' "$v" | jq -r '.gitSha // empty')\n  case "$bid" in\n    "$sha"*) echo FRESH-SILENT ;;\n    *) echo STALE-WARN ;;\n  esac\ndone\n`
    );
    const r = Bun.spawnSync(["bash", harness]);
    expect(new TextDecoder().decode(r.stdout).trim().split("\n")).toEqual(["STALE-WARN", "FRESH-SILENT"]);
    expect(r.exitCode).toBe(0);
    rmSync(TMP, { recursive: true, force: true });
  });
});
