#!/usr/bin/env bun
/**
 * scripts/pn031i/render-check.ts — رندر قالب اسکریپت رلهٔ PN-031-I و وارسی bash
 * خروجی: /tmp/pn031i-relay-render.sh (برای bash -n و تست‌های بعدی)
 */
import { buildRelayScript, buildInstallCommand } from "../../src/lib/melk-api/relay-script";

const script = buildRelayScript({
  serverUrl: "https://preview-chat-example.space-z.ai",
  deviceId: "poco-f3-test01",
  deviceSecret: "0123456789abcdef",
  altServerUrl: "https://melka-proxy.nemsey-ns.workers.dev/relay",
});

const install = buildInstallCommand("https://preview-chat-example.space-z.ai", "poco-f3-abc123");

await Bun.write("/tmp/pn031i-relay-render.sh", script);
await Bun.write("/tmp/pn031i-install-render.txt", install);

// وارسی‌های محتوایی (بدون اجرا)
const checks: Array<[string, boolean]> = [
  ["http1.1 در signed_curl", script.includes('curl --http1.1 -A "$UA" -sS --max-time 35')],
  ["UA بروزری", script.includes("Chrome/128.0.6613.88 Mobile Safari/537.36")],
  ["نردبان retry", script.includes("RETRY_DELAYS=(30 60 120 300 300)")],
  ["سقف نرخ ۵/دقیقه", script.includes("-ge 5 ]") && script.includes("60 - (now - oldest) + 1")],
  ["لاگ دیباگ", script.includes("relay-debug.log") && script.includes("debug_rotate")],
  ["redact امضا", script.includes("redacted>")],
  ["مسیر جایگزین", script.includes("ALT_SERVER_URL") && script.includes("ALT_FAIL_THRESHOLD=3")],
  ["نبض نسخه", script.includes("version_ping") && script.includes("api/version")],
  ["پیش‌پرواز G حفظ", script.includes("خطای داخلی: امضا/زمان خالی")],
  ["whitelist مقصد حفظ", script.includes("https://*.melketabriz.ir/*")],
  ["install command http1.1+UA", install.includes("--http1.1") && install.includes("-A \"Mozilla")],
  ["بدون خطای escape دوبل", !script.includes("\\\\${")],
];

let fail = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"} — ${name}`);
  if (!ok) fail++;
}
console.log(`\nrender: /tmp/pn031i-relay-render.sh (${script.length} chars)`);
console.log(fail === 0 ? "ALL CONTENT CHECKS PASS" : `${fail} FAILURES`);
process.exit(fail === 0 ? 0 : 1);
