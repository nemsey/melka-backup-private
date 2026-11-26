// DIR-OWNER-4STEPS-001 · گام اول — خودآزمای ساختاری کدنصب بازگردانی‌شده
// ۱) تولید دستور نصب از HEAD فعلی ۲) bash -n ۳) سوزن‌های چهار ترمیم ۴) اسکریپت هستهٔ تولیدی: bash -n + CONNECT_OK
import { buildInstallCommand, buildRelayScript } from "../../src/lib/melk-api/relay-script";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";

const URL = "https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai";
const CODE = "deadbeefcafe0123456789abcdef0123";

const cmd = buildInstallCommand(URL, CODE);
const tmp = mkdtempSync(join(tmpdir(), "melka-install-"));
const cmdPath = join(tmp, "install.sh");
writeFileSync(cmdPath, cmd, "utf8");

const results = { pass: [], fail: [] };
const check = (name: string, cond: boolean, detail = "") => (cond ? results.pass.push({ name, detail }) : results.fail.push({ name, detail }));

// ۱) bash -n دستور نصب
try {
  execSync(`bash -n ${cmdPath}`, { stdio: "pipe" });
  check("bash -n install command", true);
} catch (e) {
  check("bash -n install command", false, String(e));
}

// ۲) سوزن‌های چهار ترمیم DIR-RELAY-ACTIVATE-001
check("۸: watch_relay_activation (تماشای ۱۵۰ث)", cmd.includes("watch_relay_activation()") && cmd.includes("تا ۱۵۰ ثانیه"));
check("۸: خواندن reason رد bootstrap", cmd.includes("jq -r '.reason // empty'") && cmd.includes("reject_reason="));
for (const reason of ["used", "limit", "expired", "invalid", "revoked"]) {
  check(`۸: پیام دلیل رد «${reason}»`, new RegExp(`\\s*${reason}\\)$`, "m").test(cmd) || cmd.includes(`    ${reason})`));
}
check("۹: احیای محلی کد used", cmd.includes("احیای محلی") || cmd.includes("هستهٔ موجود روی همین گوشی را دوباره راه می‌اندازم"));
check("۱۰: تصدیب tmux با has-session", cmd.includes("tmux has-session -t melka-relay") && cmd.includes("عقبهٔ nohup"));
check("۱۱: شاهد فعال‌سازی در خروجی نصب", cmd.includes("رلهٔ ترموکس فعال شد و به سرور ملکا متصل است"));
check("سنجش revoked در تماشا", cmd.includes("device revoked"));
check("bootstrap URL embedded", cmd.includes(`${URL}/api/mobile-relay/bootstrap?code=${CODE}`));

// ۳) اسکریپت هستهٔ تولیدی — bash -n + سوزن CONNECT_OK
const core = buildRelayScript({ serverUrl: URL, deviceId: "sandbox-verify-001", deviceSecret: "a".repeat(64), altServerUrl: "" });
const corePath = join(tmp, "core-relay.sh");
writeFileSync(corePath, core, "utf8");
try {
  execSync(`bash -n ${corePath}`, { stdio: "pipe" });
  check("bash -n core relay script", true);
} catch (e) {
  check("bash -n core relay script", false, String(e));
}
check("CONNECT_OK proof (نخستین Poll موفق)", core.includes("✓ اتصال تأیید شد — رلهٔ ملکا فعال است") && core.includes("CONNECT_OK"));
check("نگهبان دو-سشنی (watchdog heredoc)", core.includes("WD_EOF") && core.includes("heartbeat"));
check("تلاش ۱۲تایی دانلود", cmd.includes("seq 1 12"));

console.log(JSON.stringify({
  schema: "melka-dir-owner-4steps-001-install-selftest",
  installBytes: cmd.length,
  coreBytes: core.length,
  ...results,
}, null, 2));
process.exit(results.fail.length ? 1 : 0);
