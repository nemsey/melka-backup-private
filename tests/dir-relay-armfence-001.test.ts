// Validate the generated relay script + install command (DIR-RELAY-ARMFENCE-001)
// Extracts the bash templates from the TS module and runs `bash -n` on them.
import { buildRelayScript, buildInstallCommand } from "../src/lib/melk-api/relay-script";
import { writeFileSync, mkdtempSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

let failures = 0;
const check = (name: string, cond: boolean, detail?: string) => {
  if (cond) console.log(`✓ ${name}`);
  else { failures++; console.error(`✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};

// 1) Generation-P markers present in the relay script
const script = buildRelayScript({
  serverUrl: "https://preview.example.space-z.ai",
  deviceId: "dev-123",
  deviceSecret: "sec-456",
  altServerUrl: "",
});
check("bootstrap script: shebang", script.startsWith("#!/usr/bin/env bash"));
check("bootstrap script: ARM governor config present", script.includes("ARM_RATE_MAX=60") && script.includes("ARM_CONC_MAX=16"));
check("bootstrap script: arm_rate_gate defined", script.includes("arm_rate_gate()"));
check("bootstrap script: arm_waf_hit defined with anti-echo guard", script.includes("arm_waf_hit()") && script.includes("در قطع فعال: تشدید نکن"));
check("bootstrap script: arm_healthy defined", script.includes("arm_healthy()"));
check("bootstrap script: arm_wait_cooldown defined", script.includes("arm_wait_cooldown()"));
check("bootstrap script: WAF case 403|420|423|402 in process_item", script.includes("403|420|423|402)"));
check("bootstrap script: Retry-After parsing", script.includes("retry-after:"));
check("bootstrap script: pool concurrency = ARM_CONC (not POOL_SLOTS)", script.includes('-lt "$ARM_CONC"') && !script.includes('-lt "$POOL_SLOTS"'));
check("bootstrap script: cooldown gate in process_set", script.includes('$(arm_cooldown_left)" -gt 0 ]'));
check("bootstrap script: cooldown gate before main poll", script.includes("arm_wait_cooldown\n"));
check("bootstrap script: heartbeat shows ARM governor", script.includes("حاکم ARM"));
check("bootstrap script: OTP exempt from ARM rate gate", script.includes("is_interactive \"$1\" && return 0"));
check("bootstrap script: never-exit doctrine intact", script.includes("SUP_RESTARTS") && script.includes("EXIT_REVOKED"));
check("bootstrap script: boost mode intact (نسل O)", script.includes("BOOST_MODE") && script.includes("EXPRESS_POLL_S_BOOST"));

// 2) bash -n on the generated relay script
const dir = mkdtempSync(join(tmpdir(), "relay-p-"));
const scriptPath = join(dir, "melka-relay.sh");
writeFileSync(scriptPath, script, { mode: 0o700 });
try {
  execSync(`bash -n ${scriptPath}`, { stdio: "pipe" });
  check("bootstrap script: bash -n syntax OK", true);
} catch (e) {
  check("bootstrap script: bash -n syntax OK", false, String(e).slice(0, 400));
}

// 3) Install command (نسل P) markers
const install = buildInstallCommand("https://preview.example.space-z.ai", "ENROLL-CODE-1");
check("install: 12-attempt bootstrap window", install.includes("seq 1 12") && install.includes("waits=(5 5 10 10 15 20 25 30 30 30 30)"));
check("install: 502/503/429 restart-aware message", install.includes("سرور در حال ریست/رستاخیز است"));
check("install: curl-28 timeout message", install.includes("تایم‌اوت (خطای ۲۸)"));
// DIR-RELAY-ACTIVATE-001: رد ۴۰۳/۴۰۴ اکنون با قرارداد JSON سرور تمایز می‌شود (reason)؛
// ردِ بدون‌قرارداد گذرای WAF/دروازه است و پیام مخصوص خودش را دارد.
check("install: 403/404 reject differentiated (contract reason)", install.includes("گذرای WAF/دروازه") && install.includes("reject_reason="));
check("install: old-instance clean swap", install.includes("pkill -f melka-relay.sh"));
check("install: HTML guard on downloaded file", install.includes("'<html'"));
check("install: deps retry ×2", install.includes("for i in 1 2"));
check("install: no premature 'کد جدید' on transient failure", !install.includes("لطفاً کد جدید بگیرید"));

// 4) bash -n on the install command (wrap in a function to allow `return`-free top level)
const installPath = join(dir, "install.sh");
writeFileSync(installPath, install, { mode: 0o700 });
try {
  execSync(`bash -n ${installPath}`, { stdio: "pipe" });
  check("install command: bash -n syntax OK", true);
} catch (e) {
  check("install command: bash -n syntax OK", false, String(e).slice(0, 400));
}

// 5) Escaping sanity: template must not leak TS `${` interpolation leftovers into bash
check("bootstrap script: no raw '\\${' leftovers", !script.includes("\\${"));
check("install command: no raw '\\${' leftovers", !install.includes("\\${"));

// 6) Parent-side architecture (bash fork semantics): governor state must live in parent
check("bootstrap script: marker-file communication (child→parent WAF strike)", script.includes('.waf-strike') && script.includes('consume_waf_marker()'));
check("bootstrap script: arm_rate_gate called in PARENT fill loop", script.includes('arm_rate_gate "$IURL"'));
check("bootstrap script: healthy counting in parent drain (not in child)", script.includes('OKN=') && !/case "\\$CODE\\" in 2\*\) arm_healthy/.test(script));

// 7) End-to-end marker flow simulation (child writes marker → parent consumes → governor reacts)
{
  // `script` is the GENERATED bash (no TS escaping left) — extract functions by regex
  const grab = (name: string): string => {
    const m = script.match(new RegExp(`^${name}\\(\\) \\{[\\s\\S]*?^\\}`, "m"));
    if (!m) throw new Error(`function ${name} not found in generated script`);
    return m[0];
  };
  const consts = [
    "ARM_WAF_COOLDOWN_UNTIL=0", "ARM_RATE_CURRENT=60", "ARM_CONC=6", "ARM_WAF_STREAK=0",
    "ARM_HEALTHY_STREAK=0", "ARM_RATE_MIN=15", "ARM_RATE_MAX=60", "ARM_RATE_MAX_BOOST=120",
    "ARM_CONC_MIN=2", "ARM_CONC_MAX=16", "ARM_WAF_BAN_BASE=20", "ARM_WAF_BAN_MAX=180", "ARM_402_QUOTA_BASE=30",
  ].join("\n");
  const sim = [
    "#!/usr/bin/env bash", "set -u", 'log() { echo "[log] $*"; }',
    consts,
    grab("arm_cooldown_left"), grab("arm_waf_hit"), grab("arm_healthy"), grab("consume_waf_marker"),
    'SPOOL=$(mktemp -d)',
    'printf \'%s\' "420 50" > "$SPOOL/.waf-strike"',   // فرزندِ شبیه‌سازی‌شده: ضربهٔ 420 با Retry-After=50
    'consume_waf_marker "$SPOOL"',                        // والد: نشان را مصرف می‌کند
    '[ "$ARM_WAF_STREAK" -eq 1 ] || { echo "FLOW-FAIL streak=$ARM_WAF_STREAK"; exit 1; }',
    '[ "$ARM_CONC" -eq 2 ] || { echo "FLOW-FAIL conc=$ARM_CONC"; exit 1; }',
    '[ "$ARM_RATE_CURRENT" -eq 30 ] || { echo "FLOW-FAIL rate=$ARM_RATE_CURRENT"; exit 1; }',
    'L=$(arm_cooldown_left)',
    '[ "$L" -gt 45 ] && [ "$L" -le 50 ] || { echo "FLOW-FAIL left=$L"; exit 1; }',
    '[ -f "$SPOOL/.waf-strike" ] && { echo "FLOW-FAIL marker not consumed"; exit 1; }',
    "echo FLOW-PASS",
  ].join("\n");
  const dir2 = mkdtempSync(join(tmpdir(), "relay-p-flow-"));
  const simPath = join(dir2, "flow.sh");
  writeFileSync(simPath, sim, { mode: 0o700 });
  try {
    const out = execSync(`bash ${simPath}`, { stdio: ["ignore", "pipe", "pipe"] }).toString();
    check("E2E marker flow: child strike → parent consume → governor reacts", out.includes("FLOW-PASS"), out.slice(0, 300));
  } catch (e) {
    check("E2E marker flow: child strike → parent consume → governor reacts", false, String(e).slice(0, 300));
  }
}

if (failures > 0) {
  console.error(`\n${failures} FAILURES`);
  process.exit(1);
}
console.log("\nALL CHECKS PASSED");
