// LIVE watchdog verification (DIR-SUPER-STRUCT-001): run the extracted watchdog.sh against
// a mock heartbeat server that verifies the HMAC exactly like the real route does.
import { buildRelayScript } from "../src/lib/melk-api/relay-script";
import { writeFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { createHmac, createHash } from "node:crypto";
import { execSync, spawn } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import http from "node:http";

const DEVICE_ID = "dev-live-123";
const SECRET = "sec-live-456";
const dir = mkdtempSync(join(tmpdir(), "qwatchdog-"));

// 1) generate + extract real watchdog
const script = buildRelayScript({ serverUrl: "http://127.0.0.1:18099", deviceId: DEVICE_ID, deviceSecret: SECRET, altServerUrl: "" });
const lines = script.split("\n");
const wdStart = lines.findIndex((l) => l.includes("<<'WD_EOF'"));
const wdEnd = lines.findIndex((l, i) => i > wdStart && l === "WD_EOF");
const wdBody = lines.slice(wdStart + 1, wdEnd).join("\n");
writeFileSync(join(dir, "watchdog.sh"), wdBody, "utf8");

// 2) device.env + relay.pid (a LIVE pid: this node process) + dummy core-relay.sh
writeFileSync(join(dir, "device.env"), `SERVER_URL='http://127.0.0.1:18099'\nDEVICE_ID='${DEVICE_ID}'\nDEVICE_SECRET='${SECRET}'\nUA='test'\n`, "utf8");
writeFileSync(join(dir, "relay.pid"), `${process.pid}\n`, "utf8");
writeFileSync(join(dir, "core-relay.sh"), "#!/usr/bin/env bash\nsleep 9999\n", "utf8");

// 3) mock heartbeat server — verifies HMAC exactly like verifyRelayRequestAuth
const beats: Array<{ body: string; sigOk: boolean; tsSkewMs: number }> = [];
const server = http.createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const raw = Buffer.concat(chunks).toString("utf8");
    // فقط ضربان قلب شمرده می‌شود — پروب ساعت (HEAD /api/health) جدا است
    if (req.method !== "POST" || !req.url?.includes("/api/mobile-relay/heartbeat")) {
      res.writeHead(200);
      res.end();
      return;
    }
    const device = req.headers["x-melka-relay-device"];
    const ts = Number(req.headers["x-melka-timestamp"]);
    const sig = String(req.headers["x-melka-signature"] ?? "");
    const digest = createHash("sha256").update(raw).digest("hex");
    const expect = createHmac("sha256", SECRET).update(`POST\n/api/mobile-relay/heartbeat\n${digest}\n${ts}`).digest("hex");
    const sigOk = expect === sig && device === DEVICE_ID && Math.abs(Date.now() - ts) < 5 * 60_000;
    beats.push({ body: raw, sigOk, tsSkewMs: Date.now() - ts });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
});
await new Promise<void>((r) => server.listen(18099, "127.0.0.1", r));

// 4) run watchdog for ~50s (heartbeats expected at ~15s and ~45s — WD_ITER%2)
const wd = spawn("bash", [join(dir, "watchdog.sh")], { stdio: ["ignore", "pipe", "pipe"] });
let wdLog = "";
wd.stdout.on("data", (d) => (wdLog += d.toString()));
wd.stderr.on("data", (d) => (wdLog += d.toString()));
await new Promise((r) => setTimeout(r, 50_000));
wd.kill("SIGTERM");
await new Promise((r) => setTimeout(r, 1_000));
server.close();

console.log("--- watchdog log ---");
console.log(wdLog.trim());
console.log("--- beats received ---");
console.log(JSON.stringify(beats, null, 1));

const okCount = beats.filter((b) => b.sigOk).length;
console.log(`RESULT: beats=${beats.length} sigOk=${okCount} expected>=2`);
if (beats.length >= 2 && okCount === beats.length && beats.every((b) => b.body.includes('"alive":true'))) {
  console.log("LIVE WATCHDOG VERIFICATION PASSED");
} else {
  console.log("LIVE WATCHDOG VERIFICATION FAILED");
  process.exit(1);
}
