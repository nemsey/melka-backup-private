/**
 * tests/dir-static-500-002.test.ts — دستور DIR-STATIC-500-002 (۱۴۰۵/۰۸/۳۰)
 * ---------------------------------------------------------------------------
 * ریشه‌یابی حادثهٔ بازگشتی ۲۰۲۶-۱۱-۲۰ ساعت ۱۴:۰۰ (تکرار DIR-STATIC-500-001
 * با پوشش جدید — همان علامت «Application error: a client-side exception»،
 * ریشهٔ متفاوت):
 *
 *   زنجیرهٔ شواهد زنده:
 *   (۱) سواپ رسمی ۱۴:۰۰:۴۸ (f2b9e62-1359) درختِ کهنهٔ فروشگاه را که CWDِ
 *       سرورِ زندهٔ ۱۳:۵۹ بود next.old + rmtree کرد → CWD سرور «(deleted)»
 *       → چانک حاوی BUILD_ID (هش آن در هر بیلد عوض می‌شود چون timestamp
 *       داخل باندل پخته می‌شود) ۵۰۰ → کرش کلاینت همهٔ بازدیدکنندگان.
 *   (۲) سیم‌لینک یتیم WS/.next → store/next (پسماند فضای کاری) گارد پوستهٔ
 *       build-with-parking.sh را واداشت هر بیلد رسمی را در همان ۲ ثانیهٔ
 *       اول ببندد → کیپر ۱۰ بار ترمیم → ۱۰ شکست پیاپی → اپ ۴۰+ دقیقه مرده.
 *
 * درمان چندلایه (رگرسیون این فایل):
 *   الف) ws-build-daemon: پاکسازی پسماند WS/.next پیش از هر بیلد
 *   ب) ws-build-daemon: سواپ امن — next.old تا راستی‌آزمایی ری‌استارت زنده
 *       نمی‌شود + ری‌استارت خود-متکی (restart_and_verify)
 *   ج) heal-deploy: تازگی deploy-done نسبت به آغاز ترمیم (نه پنجرهٔ ۶۰ث)
 *   د) listen-patch healthz v2: buildId + treeAlive (هویت درخت فرزند)
 *   هـ) socket-master: پایش drift خودکار → Blue/Green (همگرایی هر سواپ)
 */

import { describe, expect, test } from "bun:test";
import { readFileSync, existsSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { execSync, spawn } from "node:child_process";

Object.assign(process.env, {
  NODE_ENV: process.env.NODE_ENV ?? "test",
  DATABASE_URL: process.env.DATABASE_URL ?? "file:/home/z/my-project/db/test.db",
  MELK_TOKEN_KEY: process.env.MELK_TOKEN_KEY ?? "test-only-key-not-a-real-secret",
});

const ROOT = "/home/z/my-project";
const WS = "/home/z/melka-build-ws";
const STORE = "/home/z/melka-store";
const WSDAEMON = readFileSync(join(ROOT, "scripts/ws-build-daemon.py"), "utf8");
const HEAL = readFileSync(join(ROOT, "scripts/heal-deploy.sh"), "utf8");
const LISTEN_PATCH = readFileSync(join(ROOT, "scripts/pn054/listen-patch.cjs"), "utf8");
const SOCKET_MASTER = readFileSync(join(ROOT, "scripts/pn054/socket-master.py"), "utf8");

/* ═══════════ الف — پاکسازی پسماند فضای کاری (قاتل حلقهٔ ترمیم مرده) ═══════════ */

describe("DIR-STATIC-500-002 · الف — ws-build-daemon: پاکسازی WS", () => {
  test("الف-۱ سیم‌لینک/درخت WS/.next پیش از هر بیلد پاک می‌شود (ساختار)", () => {
    expect(WSDAEMON).toContain('if os.path.islink(f"{WS}/.next"):');
    expect(WSDAEMON).toContain('elif os.path.exists(f"{WS}/.next"):');
    expect(WSDAEMON).toContain("sanitized WS: removed stale .next symlink");
    // پاکسازی باید پیش از استخراج git archive باشد
    const sanIdx = WSDAEMON.indexOf("def prepare_ws()");
    const archIdx = WSDAEMON.indexOf('subprocess.run(["git", "archive", "HEAD"]');
    expect(sanIdx).toBeGreaterThan(-1);
    expect(sanIdx).toBeLessThan(archIdx);
  });

  test("الف-۲ [زنده] سیم‌لینک مسموم WS/.next با اجرای prepare_ws واقعی نابود می‌شود", () => {
    if (!existsSync(join(WS, "scripts"))) return; // فضای کاری هنوز ساخته نشده — ساختاری کافی است
    // سم‌ریزی عین حادثه: سیم‌لینک یتیم → فروشگاه
    const poison = join(WS, ".next");
    rmSync(poison, { recursive: true, force: true });
    symlinkSync(join(STORE, "next"), poison);
    expect(existsSync(poison)).toBe(true);
    // اجرای واقعی prepare_ws — باید سم را پاک و فضای کاری را از HEAD تازه کند
    execSync(
      `python3 - <<'PYEOF'
import importlib.util
spec = importlib.util.spec_from_file_location("w", "${ROOT}/scripts/ws-build-daemon.py")
w = importlib.util.module_from_spec(spec)
spec.loader.exec_module(w)
w.prepare_ws()
PYEOF`,
      { timeout: 120_000, cwd: ROOT },
    );
    // پس از پاکسازی: یا غایب (پیش از بیلد) — هرگز سیم‌لینک یتیم نیست
    const isLink = (() => {
      try {
        return !require("node:fs").statSync(poison).isFile() && require("node:fs").lstatSync(poison).isSymbolicLink();
      } catch {
        return false;
      }
    })();
    expect(isLink).toBe(false);
  }, 180_000);
});

/* ═══════════ ب — سواپ امن + ری‌استارت خود-متکی ═══════════ */

describe("DIR-STATIC-500-002 · ب — ws-build-daemon: سواپ امن", () => {
  test("ب-۱ next.old دیگر بلافاصله حذف نمی‌شود (چرخش next.older + حذف پس از راستی‌آزمایی)", () => {
    // چرخش: old → older پیش از سواپ تازه
    expect(WSDAEMON).toContain('os.rename(f"{STORE}/next.old", f"{STORE}/next.older")');
    // حذف پسماندها فقط پس از restart_and_verify
    const swapIdx = WSDAEMON.indexOf('os.rename(f"{WS}/.next", f"{STORE}/next")');
    const verifyIdx = WSDAEMON.indexOf("restart_and_verify(bid)");
    const cleanupIdx = WSDAEMON.indexOf('shutil.rmtree(f"{STORE}/next.old", ignore_errors=True)', swapIdx);
    expect(swapIdx).toBeGreaterThan(-1);
    expect(verifyIdx).toBeGreaterThan(swapIdx);
    expect(cleanupIdx).toBeGreaterThan(verifyIdx);
  });

  test("ب-۲ ری‌استارت خود-متکی: ارسال دستور + انتظار deploy-done تازه (mtime > t0) + همگرایی /api/version", () => {
    expect(WSDAEMON).toContain("def restart_and_verify(bid");
    expect(WSDAEMON).toContain('f.write(\'{"cmd":"restart"}\')');
    expect(WSDAEMON).toContain('os.path.getmtime(f"{RUNTIME}/pn054-deploy-done") > t0');
    expect(WSDAEMON).toContain('urllib.request.urlopen("http://127.0.0.1:3000/api/version"');
    expect(WSDAEMON).toContain("RESTART-VERIFIED");
  });
});

/* ═══════════ ج — heal-deploy: تازگی نسبی deploy-done ═══════════ */

describe("DIR-STATIC-500-002 · ج — heal-deploy.sh", () => {
  test("ج-۱ مبنای تازگی = آغاز ترمیم (HEAL_T0) — نشانگر کهنه دیگر جعل نمی‌کند", () => {
    expect(HEAL).toContain("HEAL_T0=$(date +%s)");
    expect(HEAL).toContain('[ "$DONE_AT" -gt "$HEAL_T0" ]');
    // پنجرهٔ مطلق ۶۰ث از گذشته حذف شده است
    expect(HEAL).not.toContain("lt 60");
  });
});

/* ═══════════ د — listen-patch healthz v2: هویت درخت فرزند ═══════════ */

describe("DIR-STATIC-500-002 · د — listen-patch.cjs healthz v2", () => {
  test("د-۱ ساختار: buildId + treeAlive در پاسخ healthz", () => {
    expect(LISTEN_PATCH).toContain("function readTreeIdentity()");
    expect(LISTEN_PATCH).toContain("buildId: tree.buildId");
    expect(LISTEN_PATCH).toContain("treeAlive: tree.treeAlive");
  });

  test("د-۲ [زنده] فرزند واقعی با پریلود: healthz هویت درخت را می‌گوید + مرگ درخت را فوراً آشکار می‌کند", async () => {
    const PORT = 3987;
    const fakeTree = "/tmp/dir-static-500-002-fake-tree";
    rmSync(fakeTree, { recursive: true, force: true });
    mkdirSync(join(fakeTree, ".next"), { recursive: true });
    writeFileSync(join(fakeTree, ".next", "BUILD_ID"), "test-bid-14050830-0001\n");
    // فرزند عین socket-master: node --require preload با health port + cwd درخت
    const child = spawn(
      "node",
      ["--require", join(ROOT, "scripts/pn054/listen-patch.cjs"), "-e", "setTimeout(()=>{}, 10000)"],
      { cwd: fakeTree, env: { ...process.env, MELKA_HEALTH_PORT: String(PORT), MELKA_LISTEN_FD: "0" }, stdio: "ignore" },
    );
    // انتظار تا health listener بالا بیاید
    let payload: Record<string, unknown> | null = null;
    for (let i = 0; i < 30 && !payload; i++) {
      await new Promise((r) => setTimeout(r, 300));
      try {
        const out = execSync(`curl -s -m 3 http://127.0.0.1:${PORT}/healthz`, { timeout: 5000 }).toString();
        if (out.includes("pid")) payload = JSON.parse(out);
      } catch {
        /* هنوز بالا نیامده */
      }
    }
    expect(payload).not.toBeNull();
    expect(payload!.buildId).toBe("test-bid-14050830-0001");
    expect(payload!.treeAlive).toBe(true);
    // مرگ درخت (عین حادثهٔ سواپ): healthz باید فوراً treeAlive=false بدهد
    rmSync(join(fakeTree, ".next"), { recursive: true, force: true });
    await new Promise((r) => setTimeout(r, 400));
    const out2 = execSync(`curl -s -m 3 http://127.0.0.1:${PORT}/healthz`, { timeout: 5000 }).toString();
    const payload2 = JSON.parse(out2);
    expect(payload2.treeAlive).toBe(false);
    expect(payload2.buildId).toBeNull();
    child.kill("SIGKILL");
    rmSync(fakeTree, { recursive: true, force: true });
  }, 30_000);
});

/* ═══════════ هـ — socket-master: پایش drift خودکار ═══════════ */

describe("DIR-STATIC-500-002 · هـ — socket-master drift monitor", () => {
  test("هـ-۱ ساختار: ثابت‌ها + تکهٔ پایش + حلقهٔ اصلی", () => {
    expect(SOCKET_MASTER).toContain("DRIFT_CHECK_S = 15");
    expect(SOCKET_MASTER).toContain("DRIFT_CONFIRM_N = 2");
    expect(SOCKET_MASTER).toContain("def drift_monitor_tick(self)");
    expect(SOCKET_MASTER).toContain("self.drift_monitor_tick()");
    // خنثی‌سازی حین بیلد رسمی
    expect(SOCKET_MASTER).toContain("def build_flag_active()");
  });

  test("هـ-۲ [زنده] منطق drift روی نمونهٔ واقعی: اختلاف پایدار → Blue/Green؛ ناشناخته → سکوت", () => {
    const out = execSync(
      `python3 - <<'PYEOF'
import importlib.util, json
spec = importlib.util.spec_from_file_location("sm", "${ROOT}/scripts/pn054/socket-master.py")
sm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sm)

class FakeChild:
    pid = 4242
    def poll(self): return None

m = sm.SocketMaster()
m.child = FakeChild()
m.child_role_port = 3100
total = [0]
def fake_deploy(): total[0] += 1
m.blue_green = fake_deploy
m.disk_build_id = lambda: "disk-bid-A"
r = {}

# (۱) drift قطعی سه پروب → دقیقاً یک Blue/Green (تأیید در دومین)
m.child_healthy = lambda port: {"pid": 4242, "buildId": "live-bid-B", "treeAlive": True}
m.drift_monitor_tick(); m.drift_monitor_tick(); m.drift_monitor_tick()
r["s1_drift_deploys"] = total[0]

# (۲) healthz قدیمی بدون buildId → سکوت مطلق (ضد حلقهٔ ری‌استارت فرزندان کهنه)
m._drift_fails = 0
m.child_healthy = lambda port: {"pid": 4242, "rssMB": 100}
m.drift_monitor_tick(); m.drift_monitor_tick(); m.drift_monitor_tick()
r["s2_oldhealthz_deploys"] = total[0] - r["s1_drift_deploys"]

# (۳) درخت مرده (treeAlive=false) → Blue/Green
m._drift_fails = 0
m.child_healthy = lambda port: {"pid": 4242, "buildId": "disk-bid-A", "treeAlive": False}
m.drift_monitor_tick(); m.drift_monitor_tick()
r["s3_deadtree_deploys"] = total[0] - r["s1_drift_deploys"] - r["s2_oldhealthz_deploys"]

# (۴) همگرا → سکوت
m._drift_fails = 0
m.child_healthy = lambda port: {"pid": 4242, "buildId": "disk-bid-A", "treeAlive": True}
m.drift_monitor_tick(); m.drift_monitor_tick(); m.drift_monitor_tick()
r["s4_converged_deploys"] = total[0] - r["s1_drift_deploys"] - r["s2_oldhealthz_deploys"] - r["s3_deadtree_deploys"]

# (۵) healthz مال فرزند دیگر → نادیده
m._drift_fails = 0
m.child_healthy = lambda port: {"pid": 9999, "buildId": "other", "treeAlive": True}
m.drift_monitor_tick(); m.drift_monitor_tick(); m.drift_monitor_tick()
r["s5_otherchild_deploys"] = total[0] - r["s1_drift_deploys"] - r["s2_oldhealthz_deploys"] - r["s3_deadtree_deploys"] - r["s4_converged_deploys"]
print(json.dumps(r))
PYEOF`,
      { timeout: 30_000, cwd: ROOT },
    ).toString();
    const parsed = JSON.parse(out.trim().split("\n").pop() ?? "{}");
    expect(parsed.s1_drift_deploys).toBe(1);
    expect(parsed.s2_oldhealthz_deploys).toBe(0);
    expect(parsed.s3_deadtree_deploys).toBe(1);
    expect(parsed.s4_converged_deploys).toBe(0);
    expect(parsed.s5_otherchild_deploys).toBe(0);
  });

  test("هـ-۳ [زنده] پرچم BUILD_RUNNING فعال → پایش ساکت (پنجرهٔ طبیعی سواپ)", () => {
    const flag = join(ROOT, "upload/.runtime/BUILD_RUNNING");
    const had = existsSync(flag);
    mkdirSync(join(ROOT, "upload/.runtime"), { recursive: true });
    writeFileSync(flag, String(Date.now() / 1000 | 0));
    try {
      const out = execSync(
        `python3 - <<'PYEOF'
import importlib.util, json
spec = importlib.util.spec_from_file_location("sm", "${ROOT}/scripts/pn054/socket-master.py")
sm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sm)
class FakeChild:
    pid = 4242
    def poll(self): return None
m = sm.SocketMaster()
m.child = FakeChild(); m.child_role_port = 3100
deploys = []
m.blue_green = lambda: deploys.append(1)
m.disk_build_id = lambda: "disk-bid-A"
m.child_healthy = lambda port: {"pid": 4242, "buildId": "stale", "treeAlive": True}
m.drift_monitor_tick(); m.drift_monitor_tick(); m.drift_monitor_tick()
print(json.dumps({"fails": m._drift_fails, "deploys": len(deploys)}))
PYEOF`,
        { timeout: 30_000, cwd: ROOT },
      ).toString();
      const parsed = JSON.parse(out.trim().split("\n").pop() ?? "{}");
      expect(parsed.fails).toBe(0);
      expect(parsed.deploys).toBe(0);
    } finally {
      if (!had) rmSync(flag, { force: true });
    }
  });
});

/* ═══════════ و — همگرایی نهایی زنده: سرور سرو‌شده == دیسک ═══════════ */

describe("DIR-STATIC-500-002 · و — راستی‌آزمایی زندهٔ سرو‌دهی", () => {
  test("و-۱ [زنده] live buildId == disk BUILD_ID و چانک نخست HTML سرو‌شده 200", () => {
    const diskBid = readFileSync(join(ROOT, ".next/BUILD_ID"), "utf8").trim();
    const ver = JSON.parse(execSync("curl -s -m 8 http://127.0.0.1:3000/api/version", { timeout: 15_000 }).toString());
    expect(ver.buildId).toBe(diskBid);
    const html = execSync("curl -s -m 8 http://127.0.0.1:3000/", { timeout: 15_000 }).toString();
    const m = html.match(/\/_next\/static\/chunks\/[^"\\]+?\.js/);
    expect(m).not.toBeNull();
    const code = execSync(`curl -s -m 8 -o /dev/null -w '%{http_code}' http://127.0.0.1:3000${m![0]}`, {
      timeout: 15_000,
    }).toString().trim();
    expect(code).toBe("200");
  });
});
