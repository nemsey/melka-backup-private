/**
 * tests/dir-relay-ultra-001.test.ts — سوئیت تخصصی دستور مالک DIR-RELAY-ULTRA-001
 * ---------------------------------------------------------------------------
 * دستور مالک (۱۴۰۵/۱۰/۰۶ · ۲۰۲۶-۱۱-۲۶ · «رفع مشکلات و تنظیم دستور نصب فوق پیشرفته»):
 *   گام اول: کدنصب جدید رله فعال می‌شود اما «آمار دریافت و ارسال پیام» در ترموکس
 *            نشان داده نمی‌شود — ریشه: تنها خط وضعیت هر ~۸ دقیقه در بیکاری، بدون
 *            شمارندهٔ پیام دریافتی/درخواست ارسالی، بدون فایل آمار و ابزار مشاهده.
 *            درمان نسل R: خط «📊 آمار» هر ≤۳۰ث در همهٔ حالت‌ها (MSG_RECV/MSG_SENT)
 *            + بقا در stats.json + ابزار status.sh + راهنمای مشاهده در کدنصب.
 *   گام دوم/سوم: آزمون واقعی ثبت آگهی (کاشی فایل‌یابی) و ثبت تغییر کدآگهی
 *            (کاشی تغییرات) از مسیر رلهٔ ترموکس — در هارنس زندهٔ مستقل
 *            (scripts/dir-relay-ultra/live-relay-e2e.py) اجرا می‌شود؛ اینجا
 *            پیمان‌های ساختاری + رفتاری تثبیت می‌شوند.
 */

import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { buildInstallCommand, buildRelayScript } from "../src/lib/melk-api/relay-script";

const URL = "https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai";
const CODE = "deadbeefcafe0123456789abcdef0123";

const install = buildInstallCommand(URL, CODE);
const core = buildRelayScript({ serverUrl: "http://localhost:3000", deviceId: "sandbox-verify-001", deviceSecret: "a".repeat(64), altServerUrl: "" });

const T = mkdtempSync(join(tmpdir(), "melka-ultra-"));
const installPath = join(T, "install.sh");
const corePath = join(T, "core-relay.sh");
writeFileSync(installPath, install, "utf8");
writeFileSync(corePath, core, "utf8");

/** کد خالص bash — بدون خطوط کامنت (سوزن‌های اثباتِ ک باید کد باشند نه متن) */
function bashCodeOf(s: string): string {
  return s.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
}
const coreCode = bashCodeOf(core);
const installCode = bashCodeOf(install);

/* ═══════════════════ گام اول — ساختار آمار زنده در هستهٔ رله ═══════════════════ */

describe("DIR-RELAY-ULTRA-001 · گام اول — آمار زندهٔ دریافت/ارسال در هستهٔ رله", () => {
  test("bash -n دستور نصب و هستهٔ رله", () => {
    execSync(`bash -n ${installPath}`, { stdio: "pipe" });
    execSync(`bash -n ${corePath}`, { stdio: "pipe" });
  });

  test("شمارنده‌های تازهٔ پیام دریافتی/درخواست ارسالی تعریف شده‌اند", () => {
    expect(coreCode).toContain("MSG_RECV=0");
    expect(coreCode).toContain("MSG_SENT=0");
    expect(coreCode).toContain("STATS_EVERY_S=30");
    expect(coreCode).toContain('STATS_FILE="$MELKA_HOME/stats.json"');
  });

  test("تابع stats_line با خط «📊 آمار» و بقا در stats.json", () => {
    expect(coreCode).toContain("stats_line()");
    expect(coreCode).toContain("📊 آمار: دریافت $MSG_RECV پیام · ارسال $MSG_SENT درخواست");
    expect(coreCode).toContain("> \"$STATS_FILE.tmp\" 2>/dev/null && mv -f \"$STATS_FILE.tmp\" \"$STATS_FILE\"");
  });

  test("فراخوانی stats_line در هر دو حلقه (اصلی + process_set) — همهٔ حالت‌ها", () => {
    // حلقهٔ اصلی: بعد از LOOPS++ · process_set: بعد از while :; do
    expect(coreCode).toContain("LOOPS=$((LOOPS+1))\n    stats_line");
    expect(coreCode).toContain("while :; do\n    stats_line");
  });

  test("شمارش دریافت پیام در برداشت آیتم (process_set)", () => {
    expect(coreCode).toContain('[ -z "$ITEM" ] && continue\n      MSG_RECV=$((MSG_RECV+1))');
  });

  test("شمارش ارسال درخواست در تخلیهٔ نتیجه (drain_spool)", () => {
    expect(coreCode).toContain("BATCHES=$((BATCHES+1))\n    MSG_SENT=$(( MSG_SENT + ${totaln:-0} ))");
    expect(coreCode).toContain('log "جریان نتیجه: ${totaln:-0} مورد → ${errn:-0} خطا (مجموع: دریافت $MSG_RECV · ارسال $MSG_SENT');
  });

  test("ضربان «زنده» اکنون شامل دریافت/ارسال است", () => {
    expect(coreCode).toContain("دریافت $MSG_RECV / ارسال $MSG_SENT / تحویل $SERVED");
  });

  test("مولد ابزار status.sh (آمار هر زمان بدون tmux)", () => {
    expect(coreCode).toContain("cat > \"$MELKA_HOME/status.sh\" <<'STATUS_EOF'");
    expect(coreCode).toContain("پیام دریافتی از سرور:");
    expect(coreCode).toContain('chmod 700 "$MELKA_HOME/status.sh"');
    // jq با درون‌یابی صحیح \(.recv) — نه متن خام
    expect(core).toContain("\\(.recv)\\nدرخواست ارسالی به آرم: \\(.sent)");
  });

  test("بنر راهنما + init شمارنده‌ها", () => {
    expect(core).toContain("bash $MELKA_HOME/status.sh");
    expect(coreCode).toContain("MSG_RECV=0; MSG_SENT=0; LAST_STATS=0; RELAY_START_TS=$(date +%s)");
  });

  test("پیشینهٔ فعال‌سازی (DIR-RELAY-ACTIVATE-001) دست‌نخورده — شاهد CONNECT_OK دو مسیر", () => {
    expect(coreCode).toContain("CONNECT_OK=1");
    expect(coreCode).toContain("رلهٔ ملکا فعال است");
    expect(installCode).toContain("watch_relay_activation()");
  });
});

/* ═══════════════════ گام اول — کدنصب فوق پیشرفته ═══════════════════ */

describe("DIR-RELAY-ULTRA-001 · گام اول — راهنمای آمار در کدنصب", () => {
  test("تعریف print_stats_guide + دو فراخوانی (tmux/nohup)", () => {
    expect(installCode).toContain("print_stats_guide()");
    expect(installCode).toContain('echo "مشاهدهٔ آمار در هر لحظه (بدون اتصال tmux): bash $HOME/melka-relay/status.sh"');
    expect(installCode).toContain("tmux attach -t melka-relay");
    const calls = installCode.split("print_stats_guide").length - 1;
    expect(calls).toBeGreaterThanOrEqual(3); // def + شاخهٔ tmux + شاخهٔ nohup
  });

  test("شاهد آمار در تماشای فعال‌سازی — خط «📊 آمار» چاپ می‌شود", () => {
    expect(installCode).toContain('printf \'%s\\n\' "$out" | grep "📊 آمار" | tail -n 1 || true');
  });

  test("قرارداد reason رد bootstrap پابرجا (used/limit/expired/invalid/revoked)", () => {
    for (const reason of ["used", "limit", "expired", "invalid", "revoked"]) {
      expect(install).toContain(reason);
    }
    expect(installCode).toContain("jq -r '.reason // empty'");
  });

  test("تماشای فعال‌سازی ۱۵۰ث + تصدیب tmux has-session + عقبهٔ nohup", () => {
    expect(installCode).toContain("seq 1 15");
    expect(installCode).toContain("tmux has-session -t melka-relay");
    expect(installCode).toContain("عقبهٔ nohup");
  });
});

/* ═══════════════════ رفتاری — تابع تولیدی عیناً اجرا می‌شود ═══════════════════ */

describe("DIR-RELAY-ULTRA-001 · آزمون رفتاری تابع stats_line تولیدی", () => {
  test("خروجی خط آمار + stats.json با مقادیر صحیح + throttle", () => {
    const sim = mkdtempSync(join(tmpdir(), "melka-ultra-run-"));
    mkdirSync(join(sim, "melka-relay"), { recursive: true });
    const s = core.indexOf("stats_line() {");
    const e = core.indexOf("debug_rotate()", s);
    const fn = core.slice(s, core.indexOf("\n}", s) + 2);
    const harness = [
      "#!/usr/bin/env bash",
      "set -u",
      `STATS_FILE="${join(sim, "melka-relay", "stats.json")}"`,
      "STATS_EVERY_S=30",
      "MSG_RECV=5; MSG_SENT=4; SERVED=2; ERRORS=1; BATCHES=2; LOOPS=11",
      "LAST_STATS=0; RELAY_START_TS=$(( $(date +%s) - 7325 ))",
      "ARM_RATE_CURRENT=45; ARM_CONC=8; URL_IDX=1; BOOST_MODE=0; STEALTH=1",
      "log() { echo \"[\$(date '+%H:%M:%S')] \$*\"; }",
      fn,
      "stats_line",
      `cat "${join(sim, "melka-relay", "stats.json")}"`,
      "stats_line", // throttle: باید ساکت باشد
      'echo SILENT-CHECK',
    ].join("\n");
    const hp = join(sim, "harness.sh");
    writeFileSync(hp, harness, "utf8");
    const out = execSync(`bash ${hp}`, { stdio: "pipe", encoding: "utf8" });
    expect(out).toContain("📊 آمار: دریافت 5 پیام · ارسال 4 درخواست · تحویل 2 نتیجه · خطا 1 · 2 دسته");
    expect(out).toContain("آنلاین 02:02");
    expect(out).toContain("مسیر جایگزین");
    expect(out).toContain('"recv":5,"sent":4,"served":2,"errors":1,"batches":2,"loops":11');
    // throttle: دومین فراخوانی فوری خروجی آمار ندارد (فقط SILENT-CHECK بعد از یک خط آمار)
    const statsLines = out.split("\n").filter((l) => l.includes("📊 آمار:"));
    expect(statsLines.length).toBe(1);
    expect(out).toContain("SILENT-CHECK");
  });

  test("ابزار status.sh تولیدی: آمار کامل فارسی از stats.json", () => {
    const sim = mkdtempSync(join(tmpdir(), "melka-ultra-status-"));
    mkdirSync(join(sim, "melka-relay"), { recursive: true });
    // استخراج محتوای heredoc status.sh از اسکریپت تولیدی
    const marker = "cat > \"$MELKA_HOME/status.sh\" <<'STATUS_EOF'\n";
    const s = core.indexOf(marker) + marker.length;
    const e = core.indexOf("STATUS_EOF\n", s);
    writeFileSync(join(sim, "melka-relay", "status.sh"), core.slice(s, e), "utf8");
    writeFileSync(
      join(sim, "melka-relay", "stats.json"),
      '{"ts":1795686273,"startTs":1795682608,"recv":7,"sent":6,"served":5,"errors":1,"batches":3,"loops":42,"rate":60,"conc":6,"boost":0,"stealth":0}\n',
      "utf8",
    );
    const out = execSync(`HOME=${sim} bash ${join(sim, "melka-relay", "status.sh")}`, { stdio: "pipe", encoding: "utf8" });
    expect(out).toContain("پیام دریافتی از سرور: 7");
    expect(out).toContain("درخواست ارسالی به آرم: 6");
    expect(out).toContain("نتیجهٔ تحویل‌شده به سرور: 5");
    expect(out).toContain("نرخ جاری ARM: 60/دقیقه");
    expect(out).toContain("tmux attach -t melka-relay");
  });
});

/* ═══════════════════ گام دوم/سوم — پیمان مسیر رله-اول (پیش‌نیاز E2E) ═══════════════════ */

describe("DIR-RELAY-ULTRA-001 · پیمان‌های گام دوم/سوم (E2E در هارنس زنده)", () => {
  test("هارنس E2E زندهٔ رله موجود است (ثبت آگهی + تغییر کدآگهی از مسیر رله)", () => {
    const p = "/home/z/my-project/scripts/dir-relay-ultra/live-relay-e2e.py";
    expect(existsSync(p)).toBe(true);
    expect(readFileSync(p, "utf8")).toContain("register");
    expect(readFileSync(p, "utf8")).toContain("change-owner");
  });
});

// پاک‌سازی نهایی
test("cleanup tmp", () => {
  rmSync(T, { recursive: true, force: true });
});
