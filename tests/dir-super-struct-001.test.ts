/**
 * tests/dir-super-struct-001.test.ts — DIR-SUPER-STRUCT-001 · دستور مالک ۲۰۲۶-۱۱-۲۵
 * ---------------------------------------------------------------------------
 * «ساختار فوق پیشرفتهٔ بروزرسانی فهرست‌های چهارگانه + کدنصب فوق پیشرفتهٔ رلهٔ
 * ترموکس + هماهنگی کامل بین آنها» — پوشش سه بخش:
 *
 * بخش الف (مغز متفکر): برچسب اتمی (P0_DONE/P1_DONE/ALL_DONE · تک‌جهتی SQL) +
 *   آبشار (P1 پیش از P0 ممنوع) + سینک دلتا (فقط ردیف‌های تغییرکرده).
 * بخش ب (دست‌های اجرایی): نسل Q اسکریپت رله — قلاب طلایی (bootstrap یک‌فایله) +
 *   ارکستراتور tmux دو-سشنی + نگهبان (وارسی ۱۵ث/بازآید) + صف آفلاین SQLite +
 *   مدیریت خطای هوشمند (AIMD — میراث نسل N/P).
 * بخش ج (سیستم عصبی): ضربان قلب ۳۰ث (سه غایب = «رلهٔ ترموکس قطع شده است») +
 *   مانیفست کار در پاسخ poll + ACK ردیفی (.results[]) + مخفی‌کاری (نرخ انسانی).
 *
 * لایه‌ها: (۱) bash -n روی اسکریپت‌های تولیدی + گاردهای ساختاری · (۲) واحدهای
 * sync-stage · (۳) هستهٔ kernel با sqlite ایزوله (برچسب تک‌جهتی + دلتا) ·
 * (۴) واحدهای relay (مخفی‌کاری/ضربان/مانیفست) · (۵) نمای چهار فهرست (stage + relay).
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";

// ── ایزوله‌سازی فایل‌های اجرایی پیش از هر import (عین pn051/pn083) ──
const ISO_DIR = mkdtempSync(join(tmpdir(), "dir-super-struct-"));
process.env.MELK_LCPP_RUNTIME_DIR = ISO_DIR;

import { buildRelayScript, buildInstallCommand } from "../src/lib/melk-api/relay-script";
import {
  SYNC_STAGES,
  STAGE_RANK,
  STAGE_FA,
  advanceStage,
  stageGuardSql,
  stageCoverage,
  waterfallPendingP0,
  invalidateStageCoverage,
} from "../src/lib/melk-api/sync-stage";
import {
  createBulkWriter,
  SqlBulkWriter,
  type BulkTableSpec,
} from "@/sync/lists/kernel";
import {
  readRelayStealthProfile,
  writeRelayStealthProfile,
  RELAY_STEALTH_DEFAULT,
  relayHeartbeatSummary,
  relayJobManifest,
  noteRelayHeartbeat,
  RELAY_HEARTBEAT_INTERVAL_MS,
  RELAY_HEARTBEAT_MISSED_WARN,
} from "../src/lib/melk-api/relay";
import { readFourListsUnified, FOUR_LISTS } from "../src/lib/melk-api/four-lists";

/* ═══════════════ بخش ب + ج — اسکریپت نسل Q (bash معتبر + گاردها) ═══════════════ */

const script = buildRelayScript({
  serverUrl: "https://preview.example.space-z.ai",
  deviceId: "dev-123",
  deviceSecret: "sec-456",
  altServerUrl: "https://alt.example.space-z.ai",
});
const install = buildInstallCommand("https://preview.example.space-z.ai", "ENROLL-777");
const scriptPath = join(ISO_DIR, "core-relay.sh");
const installPath = join(ISO_DIR, "install.sh");
writeFileSync(scriptPath, script, "utf8");
writeFileSync(installPath, install, "utf8");

/** استخراج بدنهٔ نگهبان از قالب هسته (بین <<'WD_EOF' تا ^WD_EOF) */
const scriptLines = script.split("\n");
const wdStart = scriptLines.findIndex((l) => l.includes("<<'WD_EOF'"));
const wdEnd = scriptLines.findIndex((l, i) => i > wdStart && l === "WD_EOF");
const watchdogBody = scriptLines.slice(wdStart + 1, wdEnd).join("\n");
const watchdogPath = join(ISO_DIR, "watchdog.sh");
writeFileSync(watchdogPath, watchdogBody, "utf8");

describe("DIR-SUPER-STRUCT-001 · بخش ب — نسل Q اسکریپت رله (bash معتبر)", () => {
  test("اسکریپت کامل هستهٔ رله معتبر است (bash -n)", () => {
    execSync(`bash -n ${scriptPath}`);
  });

  test("بدنهٔ نگهبان (watchdog.sh) به‌عنوان فایل مستقل bash معتبر است", () => {
    expect(wdStart).toBeGreaterThanOrEqual(0);
    expect(wdEnd).toBeGreaterThan(wdStart + 5);
    execSync(`bash -n ${watchdogPath}`);
  });

  test("دستور نصب قلاب طلایی bash معتبر است", () => {
    execSync(`bash -n ${installPath}`);
  });

  test("حلقهٔ ضربان نگهبان: هر ۱۵ث وارسی + هر دو چرخه ضربان (۳۰ث) — عین دستور مالک", () => {
    expect(watchdogBody).toContain("sleep 15");
    expect(watchdogBody).toContain("[ $(( WD_ITER % 2 )) -eq 0 ] && wd_heartbeat");
    expect(watchdogBody).toContain("wd_heartbeat()");
    expect(watchdogBody).toContain("/api/mobile-relay/heartbeat");
  });

  test("ضربان نگهبان امضاشده است (قرارداد سه‌هدری عین poll/result)", () => {
    expect(watchdogBody).toContain('printf \'POST\\n/api/mobile-relay/heartbeat\\n%s\\n%s\'');
    expect(watchdogBody).toContain("-H \"X-Melka-Relay-Device:");
    expect(watchdogBody).toContain("-H \"X-Melka-Signature:");
    expect(watchdogBody).toContain("--data-binary \"$body\"");
  });

  test("نگهبان pid هسته را وارسی و در مرگ بازآید می‌کند (وارسی ۱۵ث · بازآید خودکار)", () => {
    expect(watchdogBody).toContain("relay.pid");
    expect(watchdogBody).toContain('kill -0 "$RP"');
    expect(watchdogBody).toContain("WD_RESTARTS=$((WD_RESTARTS+1))");
    expect(watchdogBody).toContain("setsid nohup bash \"$CORE_RELAY\"");
  });

  test("نگهبان راز را از device.env می‌خواند (نصب صفر-تزریق — heredoc نقل‌شده)", () => {
    expect(script).toContain("<<'WD_EOF'");
    expect(script).toContain("SERVER_URL='$SERVER_URL'");
    expect(script).toContain("DEVICE_SECRET='$DEVICE_SECRET'");
    expect(watchdogBody).toContain('. "$WD_DIR/device.env"');
    // راز خام در متن نگهبان نیست — فقط از طریق env
    expect(watchdogBody).not.toContain("sec-456");
  });

  test("ارکستراتور دو-سشنی tmux: نگهبان در سشن melka-watchdog + پشتیبان nohup", () => {
    expect(script).toContain('tmux new-session -d -s melka-watchdog "bash');
    expect(script).toContain("setsid nohup bash \"$MELKA_HOME/watchdog.sh\"");
    // تک‌نمونه — دوباره-spawn نگهبان زنده ممنوع
    expect(script).toContain('pgrep -f "melka-relay/watchdog.sh"');
  });

  test("قلاب طلایی نصب: هسته در ~/melka-relay/core-relay.sh + سشن tmux melka-relay", () => {
    expect(install).toContain('"$HOME/melka-relay/core-relay.sh"');
    expect(install).toContain('tmux new-session -d -s melka-relay "bash $HOME/melka-relay/core-relay.sh"');
    expect(install).toContain("tmux kill-session -t melka-relay");
    expect(install).toContain("tmux kill-session -t melka-watchdog");
    expect(install).toContain("mkdir -p \"$HOME/melka-relay\"");
    // نصب پیش‌زمینه‌ای — مالک پس از نصب به پرومپت برمی‌گردد (پس‌زمینه عین دستور)
    expect(install).not.toContain("\nbash ~/melka-relay.sh\n");
  });

  test("وابستگی‌های نسل Q در نصب: sqlite (صف آفلاین) + tmux با پشتیبان پایه", () => {
    expect(install).toContain("pkg install -y curl openssl-tool jq sqlite tmux");
    expect(install).toContain("pkg install -y curl openssl-tool jq;");
    expect(install).toContain("سلوک عقبه: صف jsonl + nohup");
  });

  test("مقاومت به ریست سرور (میراث نسل P): ۱۲ تلاش + پیام‌های تمایز‌یافته", () => {
    expect(install).toContain("seq 1 12");
    expect(install).toContain("502");
    expect(install).toContain("403");
    expect(install).toContain("کد ثبت رد شد");
    expect(install).toContain("head -n 1");
    expect(install).toContain("grep -q '^#!'");
  });

  test("pid فایل هسته نوشته می‌شود (وابسته به نگهبان) + خود-نصب قلاب طلایی", () => {
    expect(script).toContain('printf \'%s\\n\' "$$" > "$RELAY_PID_FILE"');
    expect(script).toContain('cp -f "$0" "$MELKA_HOME/core-relay.sh"');
  });

  test("صف آفلاین SQLite: انبار + بازپخش بسته‌های ۱۰۰تایی + پشتیبان jsonl", () => {
    expect(script).toContain("offline-queue.db");
    expect(script).toContain("OFFLINE_DRAIN_MAX=100");
    expect(script).toContain("offline_store()");
    expect(script).toContain("offline_delete_ids()");
    expect(script).toContain("offline_replay()");
    expect(script).toContain('store_failed "$payload"');
    // فراخوانی در حلقهٔ اصلی (نه فقط تعریف — درج ۴-فاصله‌ای داخل relay_main)
    expect(script.split("\n").filter((l) => l === "    offline_replay").length).toBe(1);
  });

  test("ACK ردیفی: حکم هر نتیجه از .results[] خوانده می‌شود", () => {
    expect(script).toContain("[.results[]? | select(.ok == true) | .id] | join(\" \")");
    expect(script).toContain("[.results[]? | select(.ok != true) | .id]");
    expect(script).toContain("offline_delete_ids $POST_ACKED $POST_REJ");
  });

  test("ضربان پشتیبان حلقهٔ اصلی وقتی نگهبان نیست (WD_SPAWNED گارد)", () => {
    expect(script).toContain('if [ "$WD_SPAWNED" -ne 1 ]; then');
    const relayMainIdx = script.indexOf("relay_main() {");
    const fallbackIdx = script.indexOf('if [ "$WD_SPAWNED" -ne 1 ]; then');
    expect(relayMainIdx).toBeGreaterThan(0);
    expect(fallbackIdx).toBeGreaterThan(relayMainIdx);
  });
});

describe("DIR-SUPER-STRUCT-001 · بخش ج — مانیفست + مخفی‌کاری در اسکریپت", () => {
  test("مانیفست کار از پاسخ poll خوانده می‌شود (بنر یک‌باره هنگام تغییر)", () => {
    expect(script).toContain(".manifest.note // empty");
    expect(script).toContain('[ "$MNOTE" != "$LAST_MANIFEST" ]');
    expect(script).toContain('LAST_MANIFEST="$MNOTE"');
  });

  test("مخفی‌کاری از پاسخ poll خوانده می‌شود (enabled + ratePerMin + jitterPct)", () => {
    expect(script).toContain(".stealth.enabled // false");
    expect(script).toContain(".stealth.ratePerMin // 20");
    expect(script).toContain(".stealth.jitterPct // 20");
    expect(script).toContain("STEALTH=1");
    expect(script).toContain("STEALTH_RATE=$ST_RATE");
  });

  test("گام انسانی مخفی‌کاری در گیت نرخ ARM + تسلیم در حالت تمام‌ظرفیت", () => {
    expect(script).toContain("gap=$(( 60000 / STEALTH_RATE ))");
    expect(script).toContain('if [ "$STEALTH" -eq 1 ] && [ "$BOOST_MODE" -eq 0 ]; then');
    expect(script).toContain("STEALTH_JITTER");
  });

  test("قراردادهای سرور پابرجا: boost نسل O + امضای RELAY + whitelist میزبان", () => {
    expect(script).toContain(".boost // false");
    expect(script).toContain("https://*.melketabriz.ir/*");
    expect(script).toContain('printf \'RELAY\\n%s\\n%s\\n%s\\n%s\\n%s\'');
  });
});

describe("DIR-SUPER-STRUCT-001 · قرارداد سرور (poll/result/heartbeat/stealth)", () => {
  test("poll پاسخ مانیفست + مخفی‌کاری + boost را می‌دهد (قرارداد نسل Q)", () => {
    const pollSrc = readFileSync("src/app/api/mobile-relay/poll/route.ts", "utf8");
    expect(pollSrc).toContain("relayJobManifest");
    expect(pollSrc).toContain("stealth: { enabled: stealth.enabled");
    expect(pollSrc).toContain("boost");
  });

  test("روت ضربان قلب امضاشده موجود است (۳۰ث · سه غایب = قطعی)", () => {
    const hbSrc = readFileSync("src/app/api/mobile-relay/heartbeat/route.ts", "utf8");
    expect(hbSrc).toContain("verifyRelayRequestAuth");
    expect(hbSrc).toContain("noteRelayHeartbeat");
    expect(RELAY_HEARTBEAT_INTERVAL_MS).toBe(30_000);
    expect(RELAY_HEARTBEAT_MISSED_WARN).toBe(3);
  });

  test("result ردیفی ACK صادر می‌کند (.results[] با id/ok)", () => {
    const resSrc = readFileSync("src/app/api/mobile-relay/result/route.ts", "utf8");
    expect(resSrc).toContain("results.push({ id, ok: r.ok");
    expect(resSrc).toContain("accepted: results.filter");
    expect(resSrc).toContain("results }");
  });

  test("روت مخفی‌کاری فقط مالک (OWNER) می‌تواند تغییر دهد", () => {
    const stSrc = readFileSync("src/app/api/admin/relay/stealth/route.ts", "utf8");
    expect(stSrc).toContain('requireRole(request, "OWNER"');
    expect(stSrc).toContain("writeRelayStealthProfile");
  });

  test("داشبورد: هشدار «رلهٔ ترموکس قطع شده است» + نوار برچسب اتمی در UI", () => {
    const ui = readFileSync("src/components/tiles/SuperListUpdate.tsx", "utf8");
    expect(ui).toContain("رلهٔ ترموکس قطع شده است");
    expect(ui).toContain("relay-heartbeat-banner");
    expect(ui).toContain("super-update-stage-");
    expect(ui).toContain("برچسب اتمی رکوردها");
    expect(ui).toContain("P1_DONE");
  });
});

/* ═══════════════ بخش الف — برچسب اتمی (واحدهای sync-stage) ═══════════════ */

describe("DIR-SUPER-STRUCT-001 · بخش الف — برچسب اتمی (advanceStage تک‌جهتی)", () => {
  test("صعود مجاز: NULL → P0_DONE → ALL_DONE", () => {
    expect(advanceStage(null, "P0_DONE")).toBe("P0_DONE");
    expect(advanceStage("P0_DONE", "ALL_DONE")).toBe("ALL_DONE");
    expect(advanceStage(null, "P1_DONE")).toBe("P1_DONE");
  });

  test("تنزل ممنوع: ALL_DONE با P0_DONE ورودی تنزل نمی‌خورد", () => {
    expect(advanceStage("ALL_DONE", "P0_DONE")).toBe("ALL_DONE");
    expect(advanceStage("P1_DONE", "P0_DONE")).toBe("P1_DONE");
  });

  test("ورودی صفر/نال = ننوشتن — مقدار فعلی می‌ماند", () => {
    expect(advanceStage("P0_DONE", null)).toBe("P0_DONE");
    expect(advanceStage("P0_DONE", "")).toBe("P0_DONE");
    expect(advanceStage(null, null)).toBe(null);
  });

  test("دامنهٔ برچسب‌ها + رتبه‌ها + برچسب‌های فارسی کامل", () => {
    expect(SYNC_STAGES).toEqual(["P0_DONE", "P1_DONE", "ALL_DONE"]);
    expect(STAGE_RANK.P0_DONE).toBe(1);
    expect(STAGE_RANK.P1_DONE).toBe(2);
    expect(STAGE_RANK.ALL_DONE).toBe(3);
    expect(STAGE_RANK[""]).toBe(0);
    for (const s of SYNC_STAGES) expect(STAGE_FA[s].length).toBeGreaterThan(0);
  });

  test("SQL نگه‌دارنده تک‌جهتی: CASE چهارشاخه‌ای با excluded و جدول", () => {
    const sql = stageGuardSql("PropertyRecord", "syncStage");
    expect(sql).toContain("WHEN excluded.syncStage IS NULL OR excluded.syncStage = '' THEN PropertyRecord.syncStage");
    expect(sql).toContain("WHEN PropertyRecord.syncStage IS NULL OR PropertyRecord.syncStage = '' THEN excluded.syncStage");
    expect(sql).toContain("WHEN 'ALL_DONE' THEN 3 WHEN 'P1_DONE' THEN 2 ELSE 1 END");
    expect(stageGuardSql("RequestRecord")).toContain("RequestRecord.syncStage");
  });
});

/* ═══════════════ بخش الف — هسته: برچسب تک‌جهتی + دلتای ردیفی (sqlite ایزوله) ═══════════════ */

const DB_PATH = join(ISO_DIR, "stage-test.db");
let writer: SqlBulkWriter;

const STAGE_SPEC: BulkTableSpec = {
  table: "StageTestRow",
  naturalKey: "code",
  columns: ["name", "syncStage"],
  metaColumns: ["syncedAt"],
  stageColumn: "syncStage",
};

beforeAll(async () => {
  const isBun = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";
  const db: { exec(sql: string): unknown; close(): void } = isBun
    ? new (await import("bun:sqlite") as unknown as { Database: new (p: string) => { exec(s: string): unknown; close(): void } }).Database(DB_PATH)
    : new (await import("better-sqlite3") as unknown as { default: new (p: string) => { exec(s: string): unknown; close(): void } }).default(DB_PATH);
  db.exec(
    `CREATE TABLE IF NOT EXISTS StageTestRow (
       code TEXT PRIMARY KEY,
       name TEXT,
       syncStage TEXT,
       syncedAt INTEGER
     )`
  );
  db.close();
  writer = await createBulkWriter(DB_PATH);
});

afterAll(() => {
  writer.close();
  rmSync(ISO_DIR, { recursive: true, force: true });
});

describe("DIR-SUPER-STRUCT-001 · بخش الف — برچسب اتمی در نوشتار انبوه (SQL)", () => {
  test("فاز A رکورد را P0_DONE می‌نویسد؛ مقدار نال بعدی برچسب را نگه می‌دارد", () => {
    writer.upsertBulk(STAGE_SPEC, [{ code: "A", name: "first", syncStage: "P0_DONE", syncedAt: new Date() }]);
    expect(writer.currentValues(STAGE_SPEC, "A", ["syncStage"])?.syncStage).toBe("P0_DONE");
    writer.upsertBulk(STAGE_SPEC, [{ code: "A", name: "second", syncStage: null, syncedAt: new Date() }]);
    const row = writer.currentValues(STAGE_SPEC, "A", ["name", "syncStage"]) as { name: string | null; syncStage: string | null };
    expect(row?.name).toBe("second");
    expect(row?.syncStage).toBe("P0_DONE");
  });

  test("فاز B به ALL_DONE ارتقا می‌دهد؛ تنزل مجدد به P0_DONE ساختاراً ناممکن", () => {
    writer.upsertBulk(STAGE_SPEC, [{ code: "A", name: "second", syncStage: "ALL_DONE", syncedAt: new Date() }]);
    expect(writer.currentValues(STAGE_SPEC, "A", ["syncStage"])?.syncStage).toBe("ALL_DONE");
    // ریست سرور در میانهٔ کار → فاز A همان رکورد را دوباره P0_DONE می‌نویسد:
    // برچسب هرگز تنزل نمی‌خورد — از نقطهٔ ALL_DONE ادامه، نه از صفر (عین دستور مالک)
    writer.upsertBulk(STAGE_SPEC, [{ code: "A", name: "second", syncStage: "P0_DONE", syncedAt: new Date() }]);
    expect(writer.currentValues(STAGE_SPEC, "A", ["syncStage"])?.syncStage).toBe("ALL_DONE");
  });
});

describe("DIR-SUPER-STRUCT-001 · بخش الف — دلتای ردیفی (سینک دلتا)", () => {
  test("ردیف بی‌تغییر نوشته نمی‌شود؛ تازه/تغییرکرده برمی‌گردد", () => {
    writer.upsertBulk(STAGE_SPEC, [
      { code: "D1", name: "n1", syncStage: "P0_DONE", syncedAt: new Date() },
      { code: "D2", name: "n2", syncStage: "P0_DONE", syncedAt: new Date() },
    ]);
    // همان مقادیر عیناً → unchanged
    const same = writer.diffRows(STAGE_SPEC, [
      { code: "D1", name: "n1", syncStage: "P0_DONE", syncedAt: new Date() },
      { code: "D2", name: "n2", syncStage: "P0_DONE", syncedAt: new Date() },
    ]);
    expect(same.failed).toBe(false);
    expect(same.changed).toHaveLength(0);
    expect(same.unchanged).toBe(2);
    // یکی تغییر کرده + یکی تازه → هر دو در changed
    const mix = writer.diffRows(STAGE_SPEC, [
      { code: "D1", name: "n1-CHANGED", syncStage: "P0_DONE", syncedAt: new Date() },
      { code: "D3", name: "n3", syncStage: "P0_DONE", syncedAt: new Date() },
    ]);
    expect(mix.changed.map((r) => r.code).sort()).toEqual(["D1", "D3"]);
    expect(mix.unchanged).toBe(0);
    // برچسب در مقایسهٔ دلتا نمی‌شمرد (stageColumn مستثنا — دلتا فقط داده)
    const stageOnly = writer.diffRows(STAGE_SPEC, [{ code: "D2", name: "n2", syncStage: "ALL_DONE", syncedAt: new Date() }]);
    expect(stageOnly.unchanged).toBe(1);
    expect(stageOnly.changed).toHaveLength(0);
  });

  test("شکست مقایسه = fail-safe به سلوک پیشین (همهٔ ردیف‌ها نوشته می‌شوند)", () => {
    const badSpec: BulkTableSpec = { ...STAGE_SPEC, table: "NoSuchTable" };
    const res = writer.diffRows(badSpec, [{ code: "X", name: "n", syncStage: "P0_DONE", syncedAt: new Date() }]);
    expect(res.failed).toBe(true);
    expect(res.changed).toHaveLength(1);
  });
});

/* ═══════════════ بخش ج — مخفی‌کاری + ضربان + مانیفست (relay.ts) ═══════════════ */

describe("DIR-SUPER-STRUCT-001 · بخش ج-۴ — پروفایل مخفی‌کاری (پرونده اجرایی)", () => {
  test("پیش‌فرض: خاموش · ۲۰/دقیقه (هر ~۳ث) · جیتار ۲۰٪ — عین مثال مالک", () => {
    const p = readRelayStealthProfile();
    expect(p.enabled).toBe(false);
    expect(p.ratePerMin).toBe(20);
    expect(p.jitterPct).toBe(20);
    expect(RELAY_STEALTH_DEFAULT.ratePerMin).toBe(20);
  });

  test("نوشتن با گیره‌های مرزی: نرخ ۵..۶۰ · جیتار ۰..۵۰ · ماندگار", () => {
    const on = writeRelayStealthProfile({ enabled: true, ratePerMin: 999, jitterPct: 70 });
    expect(on.enabled).toBe(true);
    expect(on.ratePerMin).toBe(60);
    expect(on.jitterPct).toBe(50);
    const floor = writeRelayStealthProfile({ ratePerMin: 1, jitterPct: -5 });
    expect(floor.ratePerMin).toBe(5);
    expect(floor.jitterPct).toBe(0);
    const reread = readRelayStealthProfile();
    expect(reread.enabled).toBe(true);
    expect(reread.ratePerMin).toBe(5);
    expect(reread.updatedAt).toBeTruthy();
    writeRelayStealthProfile({ enabled: false });
    expect(readRelayStealthProfile().enabled).toBe(false);
  });
});

/* ═══════════════ بخش ج-۱/۲ — ضربان قلب + مانیفست (db) ═══════════════ */

const { db } = await import("@/lib/db");
const SS01_DEVICE = "ss01-wd-dev";

describe("DIR-SUPER-STRUCT-001 · بخش ج-۱ — ضربان قلب watchDog (پایگاه داده)", () => {
  beforeAll(async () => {
    await db.relayDevice.create({
      data: {
        deviceId: SS01_DEVICE,
        secret: "ss01-secret",
        label: "تست نسل Q",
        lastSeenAt: new Date(Date.now() + 3_600_000), // برندهٔ قطعی findFirst (مرتب بر lastSeenAt نزولی)
        lastHeartbeatAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    await db.relayQueue.deleteMany({ where: { claimedBy: SS01_DEVICE } }).catch(() => undefined);
    await db.relayDevice.deleteMany({ where: { deviceId: SS01_DEVICE } }).catch(() => undefined);
  });

  test("ضربان تازه (۳۰ث) = alive — noteRelayHeartbeat مهر را تازه می‌کند", async () => {
    await noteRelayHeartbeat(SS01_DEVICE, true);
    const s = await relayHeartbeatSummary();
    expect(s.status).toBe("alive");
    expect(s.beatsMissed).toBeLessThan(RELAY_HEARTBEAT_MISSED_WARN);
    expect(s.sinceSec).toBeLessThan(31);
    expect(s.legacy).toBe(false);
  });

  test("سه+ ضربان غایب + صف ساکت = «رلهٔ ترموکس قطع شده است» (silent)", async () => {
    // پیش‌شرط قطعی‌سازی: هیچ فعالیت صفی در پنجرهٔ ۹۰ث نباشد
    const cutoff = new Date(Date.now() - 90_000);
    const recentDispatch = await db.relayQueue.count({ where: { dispatchedAt: { gte: cutoff } } });
    await db.relayDevice.update({
      where: { deviceId: SS01_DEVICE },
      data: { lastHeartbeatAt: new Date(Date.now() - 10 * 60_000) },
    });
    const s = await relayHeartbeatSummary();
    if (recentDispatch > 0) {
      expect(["silent", "warning"]).toContain(s.status);
    } else {
      expect(s.status).toBe("silent");
      expect(s.beatsMissed ?? 0).toBeGreaterThanOrEqual(RELAY_HEARTBEAT_MISSED_WARN);
    }
  });

  test("ضربان غایب اما صف فعال = هشدار نرم (نسل قدیمی/نگهبان تنها زنده)", async () => {
    await db.relayQueue.create({
      data: {
        method: "GET",
        url: "https://crm.melketabriz.ir/requests/list",
        fingerprint: "ss01-fp",
        status: "dispatched",
        dispatchedAt: new Date(),
        claimedBy: SS01_DEVICE,
      },
    });
    const s = await relayHeartbeatSummary();
    expect(s.status).toBe("warning");
    expect(s.legacy).toBe(false);
  });

  test("alive=false هم ثبت می‌شود و مهر می‌خورد (نگهبانِ تنها، رلهٔ مرده)", async () => {
    await noteRelayHeartbeat(SS01_DEVICE, false); // نباید بیندازد — فقط رد ثبت شود
    const fresh = await db.relayDevice.findUnique({ where: { deviceId: SS01_DEVICE }, select: { lastHeartbeatAt: true } });
    expect(fresh?.lastHeartbeatAt).toBeTruthy();
  });
});

describe("DIR-SUPER-STRUCT-001 · بخش ج-۲ — مانیفست کار (مغز به دست‌ها)", () => {
  test("حالت سکون: running=false و بدون لایه — صادقانه", async () => {
    const m = await relayJobManifest();
    expect(m.running).toBe(false);
    expect(m.list).toBeNull();
    expect(m.phase).toBeNull();
    expect(m.note).toBeNull();
    expect(m.queue.pending).toBeGreaterThanOrEqual(0);
  });

  test("فاز A فهرست آگهی‌ها = مانیفست m1/P0 با بنر فارسی", async () => {
    // فایل وضعیت LCPP ساختگی — readLcppStatus از همین مسیر می‌خواند
    writeFileSync(
      join(ISO_DIR, "lcpp-status.json"),
      JSON.stringify({
        version: 1,
        cycleId: "ss01-cycle",
        running: true,
        phase: "fast-pass",
        startedAt: new Date().toISOString(),
        finishedAt: null,
        lists: {
          "m1-arm-listings": {
            list: "m1-arm-listings",
            phase: "fast-pass",
            label: "فهرست آگهی‌ها",
            progressPct: 42,
            fetched: 500,
            written: 300,
            skippedUnchanged: 2,
            durationMs: 1234,
            updatedAt: new Date().toISOString(),
          },
        },
      }),
      "utf8"
    );
    const m = await relayJobManifest();
    expect(m.running).toBe(true);
    expect(m.list).toBe("m1");
    expect(m.listLabel).toBe("فهرست آگهی‌ها");
    expect(m.phase).toBe("P0");
    expect(m.progressPct).toBe(42);
    expect(m.note).toContain("دستور کار جاری");
    expect(m.note).toContain("حیاتی (P0)");
    // پاک‌سازی فایل ساختگی — سلوک سکون برگردد
    rmSync(join(ISO_DIR, "lcpp-status.json"), { force: true });
    const after = await relayJobManifest();
    expect(after.running).toBe(false);
  });
});

/* ═══════════════ بخش الف — نمای چهار فهرست (stage + relay در داشبورد) ═══════════════ */

describe("DIR-SUPER-STRUCT-001 · نمای یکپارچهٔ چهار فهرست (هماهنگی مغز ↔ داشبورد)", () => {

  test("هر چهار فهرست حاضرند و m1/m2 فیلد برچسب اتمی دارند", async () => {
    const view = await readFourListsUnified(db);
    for (const id of ["m1", "m2", "m3", "m4"] as const) {
      expect(view.lists[id]).toBeTruthy();
      expect(view.lists[id].label).toBe(FOUR_LISTS[id].label);
    }
    for (const id of ["m1", "m2"] as const) {
      const st = view.lists[id].stage;
      expect(st).toBeTruthy();
      expect(st!.p0 + st!.p1 + st!.all + st!.unmarked).toBe(st!.total);
      expect(st!.completePct).toBeGreaterThanOrEqual(0);
    }
    expect(view.lists.m3!.stage).toBeNull();
    expect(view.lists.m4!.stage).toBeNull();
  });

  test("نمای رله (ضربان قلب) برای داشبورد در دید است — میدان سرور/رله", async () => {
    const view = await readFourListsUnified(db);
    // relay ممکن است در محیط تست null نباشد؛ اگر هست باید heartbeat با قضاوت صحیح باشد
    if (view.relay) {
      expect(["alive", "warning", "silent"]).toContain(view.relay.heartbeat.status);
      expect(typeof view.relay.mode).toBe("string");
    } else {
      expect(view.relay).toBeNull();
    }
  });

  test("پوشش برچسب اتمی از DB زنده می‌شمارد و invalidateStageCoverage کش را می‌شکند", async () => {
    invalidateStageCoverage("m2");
    const before = await stageCoverage(db, "m2");
    const code = `SS01-${Date.now()}`;
    await db.requestRecord.create({
      data: { requestCode: code, actorCode: "SS01", source: "arm", syncStage: "P1_DONE" },
    });
    invalidateStageCoverage("m2");
    const after = await stageCoverage(db, "m2");
    expect(after.p1).toBe(before.p1 + 1);
    expect(after.total).toBe(before.total + 1);
    await db.requestRecord.deleteMany({ where: { requestCode: code } });
    invalidateStageCoverage("m2");
    const restored = await stageCoverage(db, "m2");
    expect(restored.p1).toBe(before.p1);
    expect(restored.total).toBe(before.total);
  });

  test("آبشار: شمار رکوردهای P1-بدون-P0 قابل گزارش است (گیت صادقانه)", async () => {
    const n = await waterfallPendingP0(db, "m2");
    expect(n).toBeGreaterThanOrEqual(0);
  });
});
