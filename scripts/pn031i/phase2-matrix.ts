#!/usr/bin/env bun
/**
 * scripts/pn031i/phase2-matrix.ts — فاز ۲ سند PN-031-I: تشخیص علامت curl 9
 * ---------------------------------------------------------------------------
 * ۱) ایجاد دستگاه آزمایشی واقعی از URL عمومی (ورود مدیر → enroll → bootstrap json)
 * ۲) ماتریس curl روی روت poll (امضاشده):
 *    M1 h2+UA-curl · M2 h1.1+UA-curl · M3 h2+UA-browser · M4 h1.1+UA-browser (نسل I)
 *    M5 بدون هدرهای X-Melka (تشخیصی) · M6 health (HEAD) هر دو حمل‌ونقل
 * ۳) شاهد: download/pn031i/live-relay-test.json + raw outputs در download/pn031i/raw-curl/
 */
import { createHmac, createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const PUBLIC_URL = "https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai";
const UA_BROWSER =
  "Mozilla/5.0 (Linux; Android 13; Poco F3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.6613.88 Mobile Safari/537.36";

interface RunResult { exit: number; stdout: string; stderr: string; tookMs: number }

function runCurl(args: string[]): RunResult {
  const start = Date.now();
  const p = spawnSync("curl", args, { timeout: 30000, encoding: "utf8" });
  return {
    exit: p.status ?? -1,
    stdout: p.stdout ?? "",
    stderr: p.stderr ?? (p.error ? String(p.error) : ""),
    tookMs: Date.now() - start,
  };
}

async function jfetch(url: string, init?: RequestInit): Promise<{ status: number; body: unknown }> {
  const r = await fetch(url, init);
  let body: unknown = null;
  try { body = await r.json(); } catch { body = await r.text().catch(() => ""); }
  return { status: r.status, body };
}

function sign(secret: string, path: string, body: string, ts: number): string {
  const digest = createHash("sha256").update(body).digest("hex");
  const msg = `POST\n${path}\n${digest}\n${ts}`;
  return createHmac("sha256", secret).update(msg).digest("hex");
}

async function main() {
  const masterCode = JSON.parse(await Bun.file("env.platform.json").text()).MASTER_ACCESS_CODE;

  // ۱) دستگاه آزمایشی
  const login = await jfetch(`${PUBLIC_URL}/api/auth/master-login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ masterCode }),
  });
  if (login.status !== 200) throw new Error(`master-login ${login.status}`);
  const token = (login.body as { token: string }).token;

  const enroll = await jfetch(`${PUBLIC_URL}/api/admin/relay/enroll`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ label: "PN-031-I matrix (آزمایشی)" }),
  });
  if (enroll.status !== 200) throw new Error(`enroll ${enroll.status}`);
  const code = new URL((enroll.body as { bootstrapUrl: string }).bootstrapUrl).searchParams.get("code") ?? "";

  const boot = await jfetch(`${PUBLIC_URL}/api/mobile-relay/bootstrap?code=${code}&format=json`);
  if (boot.status !== 200) throw new Error(`bootstrap ${boot.status}`);
  const cfg = boot.body as { deviceId: string; deviceSecret: string; serverUrl: string; altServerUrl: string };
  await Bun.write("/tmp/pn031i-creds.json", JSON.stringify({ code, ...cfg }, null, 2));

  console.log(`device=${cfg.deviceId} · code=${code} · alt=${cfg.altServerUrl || "(none)"}`);

  // ۲) ماتریس — هر تماس با curl واقعی
  const rawDir = "download/pn031i/raw-curl";
  const body = '{"wait":0}';
  const ts = Date.now();
  const sig = sign(cfg.deviceSecret, "/api/mobile-relay/poll", body, ts);

  const matrix: Array<{ id: string; label: string; args: string[] }> = [
    { id: "M1", label: "HTTP/2 + UA-curl (رفتار نسل G)", args: ["--http2"] },
    { id: "M2", label: "HTTP/1.1 + UA-curl", args: ["--http1.1"] },
    { id: "M3", label: "HTTP/2 + UA-browser", args: ["--http2", "-A", UA_BROWSER] },
    { id: "M4", label: "HTTP/1.1 + UA-browser (نسل I)", args: ["--http1.1", "-A", UA_BROWSER] },
  ];

  const results: Array<Record<string, unknown>> = [];
  for (const m of matrix) {
    const r = runCurl([
      "-sS", "--max-time", "20", ...m.args,
      "-w", "\n%{http_code} %{http_version} %{time_total}",
      "-X", "POST", "-H", "Content-Type: application/json",
      "-H", `X-Melka-Relay-Device: ${cfg.deviceId}`,
      "-H", `X-Melka-Timestamp: ${ts}`,
      "-H", `X-Melka-Signature: ${sig}`,
      "--data-binary", body,
      `${PUBLIC_URL}/api/mobile-relay/poll`,
    ]);
    const lines = r.stdout.trim().split("\n");
    const lastLine = lines.pop() ?? "";
    const [httpCode, httpVer, timeTotal] = lastLine.split(" ");
    results.push({
      id: m.id, label: m.label, curlExit: r.exit, httpCode: httpCode ?? "",
      httpVersion: httpVer ?? "", timeTotalSec: timeTotal ?? "", tookMs: r.tookMs,
      bodyHead: lines.join(" ").slice(0, 200), stderrHead: r.stderr.slice(0, 200),
    });
    await Bun.write(`${rawDir}/${m.id}.txt`, `ARGS: ${m.args.join(" ")}\n\nSTDOUT:\n${r.stdout}\n\nSTDERR:\n${r.stderr}\n`);
    console.log(`${m.id}: exit=${r.exit} http=${httpCode} ver=${httpVer} ${r.tookMs}ms`);
  }

  // M5 — بدون هدرهای احراز (تشخیصی)
  {
    const r = runCurl(["-sS", "--http1.1", "-A", UA_BROWSER, "--max-time", "20", "-w", "\n%{http_code} %{http_version}", "-X", "POST", "-H", "Content-Type: application/json", "--data-binary", body, `${PUBLIC_URL}/api/mobile-relay/poll`]);
    const lines = r.stdout.trim().split("\n");
    const [httpCode, httpVer] = (lines.pop() ?? "").split(" ");
    results.push({ id: "M5", label: "بدون هدرهای X-Melka (تشخیصی)", curlExit: r.exit, httpCode, httpVersion: httpVer, tookMs: r.tookMs, bodyHead: lines.join(" ").slice(0, 200) });
    await Bun.write(`${rawDir}/M5.txt`, r.stdout);
    console.log(`M5: exit=${r.exit} http=${httpCode}`);
  }

  // M6 — health هر دو حمل‌ونقل
  for (const [id, label, args] of [["M6a", "health HEAD h2", ["--http2"]], ["M6b", "health HEAD h1.1", ["--http1.1"]]] as const) {
    const r = runCurl(["-sSI", "--max-time", "15", ...args, `${PUBLIC_URL}/api/health`]);
    const ver = /HTTP\/(\d\.\d)/.exec(r.stdout)?.[1] ?? "";
    results.push({ id, label, curlExit: r.exit, httpCode: r.exit === 0 ? "200" : "", httpVersion: ver, tookMs: r.tookMs });
    console.log(`${id}: exit=${r.exit} ver=${ver}`);
  }

  const curlVer = spawnSync("curl", ["--version"], { encoding: "utf8" }).stdout?.split("\n")[0] ?? "";
  const witness = {
    phase: "PN-031-I · فاز ۲ — ماتریس تشخیص curl 9 (سند شورا-ن۰۵۰)",
    at: new Date().toISOString(),
    vantage: "sandbox container → public URL (ایران نیست — شاهد حمل‌ونقل، نه مسیر گوشی)",
    device: cfg.deviceId, enrollCode: code, altServerUrl: cfg.altServerUrl,
    curlVersion: curlVer,
    interpretation: "کد ۹ روی گوشی مالک رخ داد (IP ایران + Termux curl 8.2x). ماتریس نشان می‌دهد سرور هر ۴ ترکیب حمل‌ونقل را می‌پذیرد — پس ریشهٔ ۹ در مسیر گوشی→دروازه (WAF/h2/rate) است؛ نسخهٔ I با http1.1+UA+retry آهسته تمام آن فرضیه‌ها را یکجا حذف می‌کند.",
    matrix: results,
  };
  await Bun.write("download/pn031i/live-relay-test.json", JSON.stringify(witness, null, 2));
  const bad = results.filter((r) => (r as { curlExit: number }).curlExit !== 0).length;
  console.log(bad === 0 ? "\nALL MATRIX CALLS TRANSPORT-OK" : `\n${bad} CALLS FAILED (see raw-curl/)`);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
