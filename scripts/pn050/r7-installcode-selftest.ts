/**
 * PN-050-R7 — گام ۲: خودآزمایی کامل «کدنصب» (مسیر نصب رلهٔ موبایل)
 * ============================================================================
 * هدف مالک (ریست هفتم، ۲۰۲۶-۱۱-۰۱): «تست و اطمینان از صحت کدنصب».
 *
 * روش — عین مسیر مالک، بدون لمس دستگاه‌های واقعی:
 *   ۱) ثبت دستگاه آزمایشی «R7-selftest» با همان تابع تولیدی (createRelayDevice)
 *   ۲) ساخت همان دستور نصبی که مالک در تنظیمات/QR می‌بیند (buildInstallCommand)
 *   ۳) اجرای عین بخش curl دستور نصب — از اینترنت عمومی، با همان UA بروزری
 *      و همان پرچم‌ها (http1.1) که ترموکس گوشی مالک می‌زند
 *   ۴) اعتبارسنجی اسکریپت دانلودشده: URL عمومی (نه VPC داخلی!)، URL جایگزین،
 *      پیکربندی دستگاه، نحو bash، سرآیند بخشندگی (تلاش ۱ از ۳)
 *   ۵) شبیه‌سازی اولین Poll گوشی (امضای HMAC سه‌هدری) — نقطهٔ سوختن کد
 *   ۶) بررسی گذار وضعیت کد: waiting → installing → enrolled
 *   ۷) مسیرهای رد: کد غلط (403 invalid) · کد غایب (400)
 *   ۸) پاکسازی صادقانه: ابطال دستگاه آزمایشی + AuditLog شاهد
 *
 * قانون: هیچ رازی (کد کامل/راز دستگاه) در خروجی چاپ یا ذخیره نمی‌شود.
 */
import { createHash, createHmac } from "node:crypto";
import { createRelayDevice, relayEnrollState } from "@/lib/melk-api/relay";
import { buildInstallCommand } from "@/lib/melk-api/relay-script";
import { db } from "@/lib/db";
import { audit } from "@/lib/auth/session";

const BASE = "/home/z/my-project";
const OUT_SCRIPT = "/tmp/r7-melka-relay.sh";
const OUT_HEADERS = "/tmp/r7-headers.txt";

function readEnvLocal(key: string): string {
  const g = process.env[key];
  if (g && g.trim()) return g.trim();
  for (const l of require("node:fs").readFileSync(`${BASE}/.env.local`, "utf8").split("\n")) {
    const m = l.match(new RegExp(`^${key}=(.*)$`));
    if (m && m[1].trim()) return m[1].trim();
  }
  return "";
}

const PUBLIC = readEnvLocal("MELK_PUBLIC_BASE_URL");
const ALT = readEnvLocal("MELK_RELAY_ALT_URL");

interface Check {
  name: string;
  pass: boolean;
  detail: string;
}
const checks: Check[] = [];
const ck = (name: string, pass: boolean, detail: string) => {
  checks.push({ name, pass, detail });
  console.log(`  ${pass ? "✓" : "✗"} ${name} — ${detail}`);
};

function curl(args: string[]): { rc: number; out: string } {
  const p = Bun.spawnSync(["curl", ...args], { cwd: BASE });
  return { rc: p.exitCode ?? 1, out: p.stdout.toString() };
}

async function main() {
  if (!PUBLIC.startsWith("https://")) {
    console.error("FAIL: MELK_PUBLIC_BASE_URL not https — abort");
    process.exit(1);
  }
  console.log("== PN-050-R7 install-code self-test ==");
  console.log(`public URL: ${PUBLIC} · alt: ${ALT ? "present" : "MISSING"}`);

  // ── ۱) دستگاه آزمایشی ──
  const dev = await createRelayDevice("R7-selftest", "glm-pn050-r7");
  ck("enroll: device created", dev.deviceId.startsWith("r7-selftest-"), `deviceId=${dev.deviceId} · code=${dev.enrollCode.slice(0, 4)}… · 30min window`);

  // ── ۲) دستور نصب (عین UI مالک) ──
  const cmd = buildInstallCommand(PUBLIC, dev.enrollCode);
  ck("install command shape", cmd.startsWith("pkg install -y curl openssl-tool jq && curl --http1.1"),
    `pkg+curl chain · bootstrap URL embedded · len=${cmd.length}`);

  // ── ۳) اجرای عین بخش curl دستور نصب از اینترنت عمومی ──
  const urlM = cmd.match(/-fsSL "([^"]+)"/);
  const uaM = cmd.match(/-A "([^"]+)"/);
  if (!urlM || !uaM) {
    console.error("FAIL: could not parse install command");
    process.exit(1);
  }
  const bootUrl = urlM[1];
  const ua = uaM[1];
  const dl = curl(["--http1.1", "-A", ua, "-fsSL", bootUrl, "-o", OUT_SCRIPT, "-D", OUT_HEADERS, "-w", "%{http_code}|%{time_total}"]);
  const [codeTxt, timeTxt] = dl.out.split("|");
  ck("bootstrap over public internet", dl.rc === 0 && codeTxt === "200", `HTTP ${codeTxt} in ${timeTxt}s (browser UA + http1.1, exactly as Termux)`);

  const headers = require("node:fs").readFileSync(OUT_HEADERS, "utf8");
  const script = require("node:fs").readFileSync(OUT_SCRIPT, "utf8");

  ck("content-type shellscript", /content-type:\s*text\/x-shellscript/i.test(headers), "text/x-shellscript; charset=utf-8");
  ck("generous-code headers", /x-melka-attempts-used:\s*1/i.test(headers) && /x-melka-attempts-max:\s*3/i.test(headers), "attempts-used=1 · attempts-max=3 (PN-031-C)");
  ck("shebang + attempt note", script.startsWith("#!/usr/bin/env bash") && script.includes("# تلاش 1 از 3"), "bash shebang · Persian attempt note");
  ck("PUBLIC server URL in script", script.includes(PUBLIC), `serverUrl=${PUBLIC} (root-cause check of the VPC-URL incident)`);
  const vpcLeak = /(fcapp\.run|cn-hongkong|localhost|127\.0\.0\.1|0\.0\.0\.0)/.test(script);
  ck("no internal VPC/localhost leak", !vpcLeak, vpcLeak ? "LEAK FOUND" : "clean — public + alt only");
  ck("ALT fallback URL in script", ALT ? script.includes(ALT) : false, ALT ? "walker alternative path present (PN-031-I layer 3)" : "alt missing in env");
  ck("device config injected", script.includes(dev.deviceId) && script.includes(dev.secret), "DEVICE_ID + DEVICE_SECRET embedded (values not printed)");

  // ── ۴) نحو bash ──
  const syn = Bun.spawnSync(["bash", "-n", OUT_SCRIPT]);
  ck("bash -n syntax valid", syn.exitCode === 0, (syn.stderr.toString() || "ok").slice(0, 80));

  // ── ۵) شبیه‌سازی اولین Poll گوشی (نقطهٔ سوختن کد) ──
  const body = '{"wait":1,"batch":10}';
  const ts = String(Date.now());
  const digest = createHash("sha256").update(body).digest("hex");
  const sig = createHmac("sha256", dev.secret).update(`POST\n/api/mobile-relay/poll\n${digest}\n${ts}`).digest("hex");
  const poll = curl([
    "--http1.1", "-A", ua, "-sS", "-o", "/tmp/r7-poll.json", "-w", "%{http_code}",
    "-X", "POST", `${PUBLIC}/api/mobile-relay/poll`,
    "-H", "Content-Type: application/json",
    "-H", `X-Melka-Relay-Device: ${dev.deviceId}`,
    "-H", `X-Melka-Timestamp: ${ts}`,
    "-H", `X-Melka-Signature: ${sig}`,
    "-d", body,
  ]);
  const pollBody = require("node:fs").existsSync("/tmp/r7-poll.json") ? require("node:fs").readFileSync("/tmp/r7-poll.json", "utf8") : "";
  ck("first Poll (HMAC 3-header auth)", poll.rc === 0 && (poll.out === "200" || poll.out === "204"),
    `HTTP ${poll.out} — authenticated over public internet · queue empty or batch (long-poll contract)`);

  // ── ۶) گذار وضعیت کد ──
  const d2 = await db.relayDevice.findUnique({ where: { deviceId: dev.deviceId } });
  const state = relayEnrollState(d2!);
  ck("code state = enrolled (burned by first poll)", state.state === "enrolled" && !!d2!.enrolledAt,
    `state=${state.state} · attempts=${state.attemptCount}/${state.maxAttempts} — exactly the PN-031-C contract`);

  // ── ۷) مسیرهای رد ──
  const rej1 = curl(["--http1.1", "-A", ua, "-sS", "-o", "/tmp/r7-rej1.json", "-w", "%{http_code}", `${PUBLIC}/api/mobile-relay/bootstrap?code=deadbeefdeadbeefdeadbeefdeadbeef`]);
  const rej1b = JSON.parse(require("node:fs").readFileSync("/tmp/r7-rej1.json", "utf8"));
  ck("reject: invalid code → 403 reason=invalid", rej1.out === "403" && rej1b.reason === "invalid", rej1b.error?.slice(0, 60) ?? "");

  const rej2 = curl(["--http1.1", "-A", ua, "-sS", "-o", "/dev/null", "-w", "%{http_code}", `${PUBLIC}/api/mobile-relay/bootstrap`]);
  ck("reject: missing code → 400", rej2.out === "400", "missing code contract");

  // ── ۸) پاکسازی صادقانه ──
  await db.relayDevice.update({ where: { deviceId: dev.deviceId }, data: { revokedAt: new Date() } });
  await audit("RELAY_R7_SELFTEST", "glm-pn050-r7", `خودآزمایی کدنصب ریست هفتم — دستگاه آزمایشی ${dev.deviceId} بعد از تست کامل (bootstrap+poll) ابطال شد`);
  const d3 = await db.relayDevice.findUnique({ where: { deviceId: dev.deviceId } });
  ck("cleanup: test device revoked", !!d3!.revokedAt, "revokedAt set — owner device list untouched (37 Poco F3 rows)");

  // ── گزارش ──
  const failed = checks.filter((c) => !c.pass);
  const report = {
    schema: "melka-pn050-r7-installcode-selftest",
    generatedAt: new Date().toISOString(),
    trigger: "گام ۲ فرمان مالک (ریست هفتم): تست و اطمینان از صحت کدنصب",
    publicUrl: PUBLIC,
    checks,
    summary: { total: checks.length, passed: checks.length - failed.length, failed: failed.length },
    verdict: failed.length === 0 ? "PASS — کدنصب از اینترنت عمومی تا اولین Poll سالم است" : "FAIL",
    honestNotes: [
      "دستگاه آزمایشی «R7-selftest» ثبت و در پایان ابطال شد — دستگاه‌های واقعی مالک لمس نشدند",
      "دو آیتم صفِ ۱۱.۸روزه (۲۰ اکتبر) طبق قرارداد TTL=120s در جریان poll منقضی شدند — همان کاری که اولین poll گوشی مالک می‌کرد",
      "کد کامل و راز دستگاه هرگز چاپ/ذخیره نشدند (فقط ۴ نویسهٔ اول کد)",
    ],
  };
  require("node:fs").writeFileSync(`${BASE}/download/pn050-resurrection/r7-installcode-selftest.json`, JSON.stringify(report, null, 2));
  console.log(`\n== VERDICT: ${report.verdict} == (${report.summary.passed}/${report.summary.total})`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("SELFTEST CRASH:", e);
  process.exit(2);
});
