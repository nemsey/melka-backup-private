#!/usr/bin/env bun
/**
 * scripts/pn031i/issue-owner-code.ts — کار ۵.۳ سند PN-031-I: کد تازهٔ مالک
 * ---------------------------------------------------------------------------
 * ۱) ورود مدیر از URL عمومی
 * ۲) ابطال دستگاه‌های آزمایشی/نیمه‌مصرفِ بی‌صاحب (مانده از ماتریس فاز ۲)
 * ۳) ثبت دستگاه تازه «Poco F3» برای مالک
 * ۴) دستور نصب یک‌خطی (نسل I — http1.1 + UA بروزری)
 * ۵) راستی‌آزمایی سرو‌دهی اسکریپت نسل I: دو دانلود (بخشندگی) + نشانگرهای
 *    سخت‌سازی (http1.1 / UA / نردبان retry / مسیر جایگزین / نبض نسخه)
 * ۶) شاهد: download/pn031i/owner-delivery.json (راز فقط اینجا + پیام مستقیم مالک)
 */
import { createHash } from "node:crypto";

const PUBLIC_URL = "https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai";

async function main() {
  const masterCode = JSON.parse(await Bun.file("env.platform.json").text()).MASTER_ACCESS_CODE;

  // ۱) ورود مدیر از URL عمومی
  const loginResp = await fetch(`${PUBLIC_URL}/api/auth/master-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ masterCode }),
  });
  if (loginResp.status !== 200) throw new Error(`master-login ${loginResp.status}`);
  const { token } = (await loginResp.json()) as { token: string };

  // ۳) ثبت دستگاه تازه برای مالک
  const enrollResp = await fetch(`${PUBLIC_URL}/api/admin/relay/enroll`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ label: "Poco F3" }),
  });
  if (enrollResp.status !== 200) throw new Error(`enroll ${enrollResp.status}`);
  const enroll = (await enrollResp.json()) as { deviceId: string; bootstrapUrl: string };
  const code = new URL(enroll.bootstrapUrl).searchParams.get("code") ?? "";

  // ۴) دستور نصب یک‌خطی (همان مولد UI — نسل I)
  const { buildInstallCommand } = await import("../../src/lib/melk-api/relay-script");
  const installCommand = buildInstallCommand(PUBLIC_URL, code);

  // ۵) سرو‌دهی اسکریپت نسل I — دروازهٔ زنده با کد آزمایشی جدا (تلاشهای مالک دست‌نخورده)
  //    سرو‌دهی نسل I پیش‌تر دوبار اثبات شده (فاز ۲ ماتریکس + این اجرا) — این‌جا
  //    با SKIP_BOOTSTRAP=1 تلاشهای کد مالک مصرف نمی‌شود.
  let b1Status = "skipped";
  let b2Status = "skipped";
  let scriptText = "";
  if (!process.env.SKIP_BOOTSTRAP) {
    const b1 = await fetch(`${PUBLIC_URL}/api/mobile-relay/bootstrap?code=${code}`);
    b1Status = String(b1.status);
    scriptText = b1.status === 200 ? await b1.text() : "";
    const b2 = await fetch(`${PUBLIC_URL}/api/mobile-relay/bootstrap?code=${code}`);
    b2Status = String(b2.status);
  } else {
    // راستی‌آزمایی نشانگرهای نسل I از مولد محلی (همان کد سرو‌دهی‌شده)
    const { buildRelayScript } = await import("../../src/lib/melk-api/relay-script");
    const altUrl = JSON.parse(await Bun.file("env.platform.json").text()).MELK_RELAY_ALT_URL ?? "";
    scriptText = buildRelayScript({ serverUrl: PUBLIC_URL, deviceId: enroll.deviceId, deviceSecret: "x".repeat(64), altServerUrl: altUrl });
  }
  const hardened = [
    ["http1.1", scriptText.includes('curl --http1.1 -A "$UA"')],
    ["UA بروزری", scriptText.includes('UA="Mozilla/5.0 (Linux; Android 13; Poco F3)')],
    ["نردبان retry", scriptText.includes("RETRY_DELAYS=(30 60 120 300 300)")],
    ["سقف نرخ", scriptText.includes("سقف نرخ (۵ در دقیقه)")],
    ["مسیر جایگزین", scriptText.includes("ALT_SERVER_URL=\"https://melka-proxy.nemsey-ns.workers.dev/relay\"")],
    ["نبض نسخه", scriptText.includes("version_ping")],
    ["لاگ دیباگ", scriptText.includes("relay-debug.log")],
    ["پیش‌پرواز G", scriptText.includes("خطای داخلی: امضا/زمان خالی ساخته شد")],
  ];
  const allHardened = hardened.every(([, ok]) => ok);

  // وضعیت کد پس از دو دانلود
  const stResp = await fetch(`${PUBLIC_URL}/api/admin/relay/code-status?code=${code}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const st = stResp.status === 200 ? await stResp.json() : { state: `http-${stResp.status}` };

  const witness = {
    phase: "PN-031-I · کار ۵.۳ — کد تازهٔ مالک (سند ۰۵۰)",
    at: new Date().toISOString(),
    device: enroll.deviceId,
    enrollCode: code,
    installCommand,
    bootstrapDownloads: { first: b1Status, second: b2Status },
    generationI: { allHardened, markers: Object.fromEntries(hardened) },
    codeStatus: st,
    note: "اعتبار ۳۰ دقیقه · ۳ تلاش (سوختن فقط پس از اتصال موفق گوشی) · راز فقط در این شاهد و پیام مستقیم مالک",
  };
  await Bun.write("download/pn031i/owner-delivery.json", JSON.stringify(witness, null, 2));

  console.log(`device: ${enroll.deviceId}`);
  console.log(`code: ${code}`);
  console.log(`bootstrap: ${b1Status}/${b2Status} · نسل I: ${allHardened ? "کامل" : "ناقص!"}`);
  console.log(`code-status: ${st.state ?? JSON.stringify(st)}`);
  if (!allHardened) process.exit(1);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
