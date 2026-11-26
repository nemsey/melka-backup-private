/**
 * tests/dir-relay-ultra-002.test.ts — سوئیت تخصصی دستور مالک DIR-RELAY-ULTRA-002
 * ---------------------------------------------------------------------------
 * دستور مالک (۱۴۰۵/۱۰/۰۶ · ۲۰۲۶-۱۱-۲۶ · پیگیری نسل R):
 *   «کدنصب تازه پیست شد اما هر ~۳۰ ثانیه خط «📊 آمار» دیده نمی‌شود؛ هر زمان
 *    bash ~/melka-relay/status.sh آمار کامل را نشان نمی‌دهد — مالک نمی‌تواند
 *    عملکرد صحیح رلهٔ ترموکس را تشخیص دهد.»
 * سه ریشهٔ یافته و درمان‌های نسل S که این سوئیت تثبیت می‌کند:
 *   RC-A) relay.log در مسیر tmux هرگز ساخته نمی‌شد (کانال «tail -f» و بخش
 *         «آخرین خطوط رله» status.sh مرده بود) → tee همزمان + بازآید نگهبان
 *         به همان فایل + چرخش کپی-کوته‌سازی ۲۵۶KB.
 *   RC-B) کادنس آمار وابسته به حلقه (بیکاری ~۵۱ث؛ خطای شبکه تا ۳۰۰ث سکوت) →
 *         POLL_WAIT_S=25 + stats_sleep تکه‌ای (≤۵ث تکه‌ها) + فراخوانی stats_line
 *         در همهٔ خواب‌های بلند والد.
 *   RC-C) status.sh خام/بی‌حکم → ساعت انسانی + سن ثانیه + حکم سلامت
 *         (✓ فعال / ⚠ کهنه با درمان) + pid/بازآید + آخرین خطوط از relay.log.
 *   + گارد BASHPID: کارگران fork هرگز stats.json کهنه نمی‌نویسند.
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
const core = buildRelayScript({ serverUrl: "http://localhost:3000", deviceId: "sandbox-verify-002", deviceSecret: "b".repeat(64), altServerUrl: "" });

const T = mkdtempSync(join(tmpdir(), "melka-ultra2-"));
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

/* ═══════════════════ RC-A — کانال relay.log زنده در مسیر tmux ═══════════════════ */

describe("DIR-RELAY-ULTRA-002 · RC-A — کانال relay.log (ریشهٔ کانال مرده)", () => {
  test("bash -n دستور نصب و هستهٔ رله (نسل S)", () => {
    execSync(`bash -n ${installPath}`, { stdio: "pipe" });
    execSync(`bash -n ${corePath}`, { stdio: "pipe" });
  });

  test("ثابت‌های کانال: RELAY_LOG + سقف چرخش ۲۵۶KB", () => {
    expect(coreCode).toContain('RELAY_LOG="$MELKA_HOME/relay.log"');
    expect(coreCode).toContain("STATS_LOG_MAX=262144");
  });

  test("tee همزمان به relay.log وقتی خروجی ترمینال زنده است (مسیر tmux گوشی)", () => {
    expect(coreCode).toContain('if [ -t 1 ] && command -v tee >/dev/null 2>&1; then');
    expect(coreCode).toContain('exec > >(tee -a "$RELAY_LOG") 2>&1');
  });

  test("چرخش کپی-کوته‌سازی (نه mv — tee با O_APPEND همان‌جا ادامه می‌دهد)", () => {
    expect(coreCode).toContain("relay_log_rotate()");
    expect(coreCode).toContain("tail -c $(( ${STATS_LOG_MAX:-262144} / 2 )) \"$RELAY_LOG\" > \"$RELAY_LOG.rot\"");
    expect(coreCode).toContain("cat \"$RELAY_LOG.rot\" > \"$RELAY_LOG\"");
  });

  test("بازآید نگهبان به همان relay.log — کانال واحد زندهٔ مالک", () => {
    expect(coreCode).toContain('setsid nohup bash "$CORE_RELAY" >> "$WD_DIR/relay.log" 2>&1 &');
    expect(coreCode).not.toContain('setsid nohup bash "$CORE_RELAY" >> "$WD_DIR/relay-restarts.log"');
  });
});

/* ═══════════════════ RC-B — کادنس ≤۳۰ث واقعی در همهٔ حالت‌ها ═══════════════════ */

describe("DIR-RELAY-ULTRA-002 · RC-B — کادنس آمار (ریشهٔ «هر ~۳۰ث دیده نمی‌شود»)", () => {
  test("بیکاری: POLL_WAIT_S=25 — چرخهٔ بیکاری ~۲۶ث (نه ~۵۱ث)", () => {
    expect(coreCode).toContain("POLL_WAIT_S=25");
    expect(coreCode).not.toContain("POLL_WAIT_S=50");
  });

  test("خواب تکه‌ای آماردار تعریف و جایگزین خواب‌های بلند شده", () => {
    expect(coreCode).toContain("stats_sleep()");
    expect(coreCode).toContain("slice=$(( remain > 5 ? 5 : remain ))");
    // خواب‌های بلند والد: چهار شاخهٔ backoff حلقهٔ اصلی
    expect(coreCode.split('stats_sleep "$delay"; continue').length - 1).toBe(4);
    // auth_delay (30..300ث) + خطای سرور 30ث + هر دو گیت نرخ
    expect(coreCode).toContain('stats_sleep "$d"');
    expect(coreCode).toContain("stats_sleep 30; continue");
    expect(coreCode.split('stats_sleep "$wait_s"').length - 1).toBe(2);
  });

  test("گارد BASHPID — کارگران fork آمار کهنه نمی‌نویسند", () => {
    expect(coreCode).toContain('[ "$BASHPID" != "$$" ] && return 0');
  });

  test("بقا آمار: فیلدهای pid و restarts (ورودی حکم سلامت status.sh)", () => {
    expect(coreCode).toContain('"pid":%s,"restarts":%s}');
    expect(coreCode).toContain('"${SUP_RESTARTS:-0}"');
  });
});

/* ═══════════════════ RC-C — status.sh با حکم سلامت ═══════════════════ */

describe("DIR-RELAY-ULTRA-002 · RC-C — ابزار status.sh (ریشهٔ «آمار کامل نشان نمی‌دهد»)", () => {
  test("مولد status.sh با ساعت انسانی + سن + حکم سلامت دوشاخه", () => {
    expect(coreCode).toContain('cat > "$MELKA_HOME/status.sh" <<\'STATUS_EOF\'');
    expect(coreCode).toContain('date -d @"$TS" \'+%H:%M:%S\'');
    expect(coreCode).toContain('AGE=$(( NOW - TS ))');
    expect(coreCode).toContain('وضعیت کلی: ✓ هستهٔ رله فعال و در حال کار است');
    expect(coreCode).toContain("⚠ هشدار — آمار $AGE ثانیه کهنه است");
    expect(coreCode).toContain("بازآید پس از خرابی: \\(.restarts // 0)");
    // آخرین خطوط از relay.log — نه فقط tmux capture
    expect(coreCode).toContain('if [ -s "$D/relay.log" ]; then');
    expect(coreCode).toContain("──── آخرین ۱۲ خط رله (relay.log) ────");
  });

  test("راهنمای آمار کدنصب — کادنس ~۳۰ث + راهنمای قضاوت فوری", () => {
    expect(installCode).toContain("print_stats_guide()");
    expect(installCode).toContain("هر حداکثر ~۳۰ ثانیه چاپ می‌شود");
    expect(installCode).toContain("راهنمای قضاوت فوری");
    expect(installCode).toContain('echo "مشاهدهٔ آمار در هر لحظه (بدون اتصال tmux): bash $HOME/melka-relay/status.sh"');
    const calls = installCode.split("print_stats_guide").length - 1;
    expect(calls).toBeGreaterThanOrEqual(3);
  });

  test("پیشینهٔ نسل R/ACTIVATE دست‌نخورده (شمارنده‌ها · شاهد فعال‌سازی · reason)", () => {
    expect(coreCode).toContain("MSG_RECV=0");
    expect(coreCode).toContain("📊 آمار: دریافت $MSG_RECV پیام");
    expect(installCode).toContain("watch_relay_activation()");
    expect(installCode).toContain("jq -r '.reason // empty'");
  });
});

/* ═══════════════════ رفتاری — توابع تولیدی عیناً اجرا می‌شوند ═══════════════════ */

describe("DIR-RELAY-ULTRA-002 · آزمون رفتاری توابع تولیدی", () => {
  test("stats_line: خروجی + stats.json با pid/restarts + گارد subshell", () => {
    const sim = mkdtempSync(join(tmpdir(), "melka-ultra2-run-"));
    mkdirSync(join(sim, "melka-relay"), { recursive: true });
    const s = core.indexOf("stats_line() {");
    const fn = core.slice(s, core.indexOf("\n}", s) + 2);
    const harness = [
      "#!/usr/bin/env bash",
      "set -u",
      `STATS_FILE="${join(sim, "melka-relay", "stats.json")}"`,
      "STATS_EVERY_S=30",
      "MSG_RECV=5; MSG_SENT=4; SERVED=2; ERRORS=1; BATCHES=2; LOOPS=11",
      "LAST_STATS=0; RELAY_START_TS=$(( $(date +%s) - 7325 ))",
      "ARM_RATE_CURRENT=45; ARM_CONC=8; URL_IDX=1; BOOST_MODE=0; STEALTH=1",
      "RELAY_LOG=\"\"; SUP_RESTARTS=2",
      "log() { echo \"[\$(date '+%H:%M:%S')] \$*\"; }",
      fn,
      "stats_line",
      `cat "${join(sim, "melka-relay", "stats.json")}"`,
      "( stats_line )", // subshell (BASHPID ≠ $$) — باید ساکت باشد
      "echo SUBSHELL-DONE",
      "stats_line", // throttle در پوستهٔ اصلی هم اکنون باید ساکت باشد
      "echo SILENT-CHECK",
    ].join("\n");
    const hp = join(sim, "harness.sh");
    writeFileSync(hp, harness, "utf8");
    const out = execSync(`bash ${hp}`, { stdio: "pipe", encoding: "utf8" });
    expect(out).toContain("📊 آمار: دریافت 5 پیام · ارسال 4 درخواست");
    expect(out).toContain('"recv":5,"sent":4,"served":2,"errors":1,"batches":2,"loops":11');
    const statsJson = readFileSync(join(sim, "melka-relay", "stats.json"), "utf8");
    expect(statsJson).toContain('"pid":');
    expect(statsJson).toContain('"restarts":2');
    // فقط یک خط آمار (subshell ساکت + throttle پوستهٔ اصلی)
    const statsLines = out.split("\n").filter((l) => l.includes("📊 آمار:"));
    expect(statsLines.length).toBe(1);
    expect(out).toContain("SUBSHELL-DONE");
    expect(out).toContain("SILENT-CHECK");
  });

  test("stats_sleep: خواب ۳۴ث = دقیقاً یک خط آمار در پنجرهٔ ۳۰ث؛ خواب ۸ث = سکوت", () => {
    const sim = mkdtempSync(join(tmpdir(), "melka-ultra2-sleep-"));
    mkdirSync(join(sim, "melka-relay"), { recursive: true });
    const s = core.indexOf("stats_line() {");
    const fnStats = core.slice(s, core.indexOf("\n}", s) + 2);
    const s2 = core.indexOf("relay_log_rotate() {");
    const fnRotate = core.slice(s2, core.indexOf("\n}", s2) + 2);
    const s3 = core.indexOf("stats_sleep() {");
    const fnSleep = core.slice(s3, core.indexOf("\n}", s3) + 2);
    const harness = [
      "#!/usr/bin/env bash",
      "set -u",
      `STATS_FILE="${join(sim, "melka-relay", "stats.json")}"`,
      "STATS_EVERY_S=30",
      "MSG_RECV=0; MSG_SENT=0; SERVED=0; ERRORS=0; BATCHES=0; LOOPS=1",
      `RELAY_START_TS=$(date +%s)`,
      "ARM_RATE_CURRENT=60; ARM_CONC=6; URL_IDX=0; BOOST_MODE=0; STEALTH=0",
      "RELAY_LOG=\"\"",
      "log() { echo \"📊 آمار: دریافت \$MSG_RECV\"; }",
      fnStats, fnRotate, fnSleep,
      "LAST_STATS=$(date +%s)", // throttle فعال — نخستین چاپ باید در ~۳۰ث رخ دهد
      "stats_sleep 34",
      "echo SLEEP34-DONE",
    ].join("\n");
    const hp = join(sim, "harness.sh");
    writeFileSync(hp, harness, "utf8");
    const t0 = Date.now();
    const out = execSync(`bash ${hp}`, { stdio: "pipe", encoding: "utf8" });
    const dur = (Date.now() - t0) / 1000;
    const lines34 = out.split("\n").filter((l) => l.includes("📊 آمار:"));
    expect(lines34.length).toBe(1); // در ۳۴ث خوابیده، دقیقاً یک پنجرهٔ ۳۰ث باز شد
    expect(out).toContain("SLEEP34-DONE");
    expect(dur).toBeGreaterThanOrEqual(33);
    expect(dur).toBeLessThan(40);

    // خواب ۸ث — زیر پنجرهٔ throttle: هیچ خط آمار
    const harness8 = harness
      .replace("stats_sleep 34", "stats_sleep 8")
      .replace("SLEEP34-DONE", "SLEEP8-DONE")
      .replace(/LAST_STATS=\$\(date \+%s\)/, "LAST_STATS=$(date +%s)");
    writeFileSync(hp, harness8, "utf8");
    const out8 = execSync(`bash ${hp}`, { stdio: "pipe", encoding: "utf8" });
    const lines8 = out8.split("\n").filter((l) => l.includes("📊 آمار:"));
    expect(lines8.length).toBe(0);
    expect(out8).toContain("SLEEP8-DONE");
  }, 90000);

  test("status.sh تولیدی: حکم سلامت دوشاخه + ساعت انسانی + آخرین خطوط relay.log", () => {
    const sim = mkdtempSync(join(tmpdir(), "melka-ultra2-status-"));
    mkdirSync(join(sim, "melka-relay"), { recursive: true });
    const marker = 'cat > "$MELKA_HOME/status.sh" <<\'STATUS_EOF\'\n';
    const s = core.indexOf(marker) + marker.length;
    const e = core.indexOf("STATUS_EOF\n", s);
    writeFileSync(join(sim, "melka-relay", "status.sh"), core.slice(s, e), "utf8");

    // حالت تازه (فعال): ts = همین حال + relay.log زنده (دقیقاً وضعیت گوشی پس از tee)
    const fresh = JSON.stringify({
      ts: Math.floor(Date.now() / 1000), startTs: Math.floor(Date.now() / 1000) - 300,
      recv: 7, sent: 6, served: 5, errors: 1, batches: 3, loops: 42,
      rate: 60, conc: 6, boost: 0, stealth: 0, pid: process.pid, restarts: 1,
    });
    writeFileSync(join(sim, "melka-relay", "stats.json"), fresh + "\n", "utf8");
    writeFileSync(join(sim, "melka-relay", "relay.log"), "[10:00:00] رلهٔ ملکا آغاز شد\n[10:00:30] 📊 آمار: دریافت 7 پیام · ارسال 6 درخواست\n", "utf8");
    writeFileSync(join(sim, "melka-relay", "relay.pid"), `${process.pid}\n`, "utf8");

    const out = execSync(`HOME=${sim} bash ${join(sim, "melka-relay", "status.sh")}`, { stdio: "pipe", encoding: "utf8" });
    expect(out).toContain("پیام دریافتی از سرور: 7");
    expect(out).toContain("درخواست ارسالی به آرم: 6");
    expect(out).toContain("بازآید پس از خرابی: 1");
    expect(out).toContain("وضعیت کلی: ✓ هستهٔ رله فعال و در حال کار است");
    expect(out).toContain("ثانیه پیش"); // سن انسانی، نه epoch خام
    expect(out).not.toContain("1795"); // هیچ epoch خامی چاپ نمی‌شود
    expect(out).toContain(`وضعیت هستهٔ رله: زنده (pid ${process.pid})`);
    expect(out).toContain("📊 آمار: دریافت 7 پیام"); // آخرین خطوط از relay.log — این بار واقعاً پر
    expect(out).not.toContain("(relay.log هنوز ساخته نشده");
    expect(out).toContain("tmux attach -t melka-relay");

    // حالت کهنه (توقف/خواب اندروید): ts = ۶۰۰ث پیش → ⚠ + راهنمای درمان
    const stale = JSON.parse(fresh);
    stale.ts = Math.floor(Date.now() / 1000) - 600;
    writeFileSync(join(sim, "melka-relay", "stats.json"), JSON.stringify(stale) + "\n", "utf8");
    const outStale = execSync(`HOME=${sim} bash ${join(sim, "melka-relay", "status.sh")}`, { stdio: "pipe", encoding: "utf8" });
    expect(outStale).toContain("⚠ هشدار — آمار 600 ثانیه کهنه است");
    expect(outStale).toContain("باتری «بدون محدودیت»"); // درمان عملی برای مالک

    // حالت بی-آمار (راه‌اندازی اولیه)
    rmSync(join(sim, "melka-relay", "stats.json"), { force: true });
    const outNone = execSync(`HOME=${sim} bash ${join(sim, "melka-relay", "status.sh")}`, { stdio: "pipe", encoding: "utf8" });
    expect(outNone).toContain("آمار هنوز ساخته نشده");
  });
});

/* ═══════════════════ هارنس زنده سه‌حالته (اجرا جدا) ═══════════════════ */

describe("DIR-RELAY-ULTRA-002 · هارنس زندهٔ سه‌حالته", () => {
  test("هارنس stats-e2e.py موجود است (شب‌تار شبکه · PTY گوشی · سرور زنده)", () => {
    const p = "/home/z/my-project/scripts/dir-relay-ultra-002/stats-e2e.py";
    expect(existsSync(p)).toBe(true);
    const h = readFileSync(p, "utf8");
    expect(h).toContain("black-hole"); // حالت A — کادنس حین backoff شبکه
    expect(h).toContain("pty"); // حالت B — مسیر ترمینال گوشی (tee به relay.log)
  });
});

// پاک‌سازی نهایی
test("cleanup tmp", () => {
  rmSync(T, { recursive: true, force: true });
});
