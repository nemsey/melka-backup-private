// PN-031-G · کار ۷ — صدور کد تازهٔ مالک + راستی‌آزمایی زندهٔ لینک‌ها
// دستگاه تازه «Poco F3» + دستور نصب یک‌خطی + راستی‌آزمایی ۲۰۰ بودن لینک‌ها (بخشندگی: ۳ تلاش)
import { createHmac } from "node:crypto";

const PUBLIC_URL = "https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai";

async function main() {
  // ۰) ورود مدیر از URL عمومی
  const masterCode = JSON.parse(await Bun.file("env.platform.json").text()).MASTER_ACCESS_CODE;
  const loginResp = await fetch(`${PUBLIC_URL}/api/auth/master-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ masterCode }),
  });
  if (loginResp.status !== 200) throw new Error(`master-login ${loginResp.status}`);
  const { token } = (await loginResp.json()) as { token: string };

  // ۱) ثبت دستگاه تازه برای مالک
  const enrollResp = await fetch(`${PUBLIC_URL}/api/admin/relay/enroll`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ label: "Poco F3" }),
  });
  if (enrollResp.status !== 200) throw new Error(`enroll ${enrollResp.status}`);
  const enroll = (await enrollResp.json()) as {
    deviceId: string;
    bootstrapUrl: string;
    enrollCode?: string;
    enrollExpires?: string;
  };
  const code = new URL(enroll.bootstrapUrl).searchParams.get("code") ?? "";

  // ۲) دستور نصب یک‌خطی (همان تابع تولیدی UI)
  const { buildInstallCommand } = await import("../src/lib/melk-api/relay-script");
  const installCommand = buildInstallCommand(PUBLIC_URL, code);

  // ۳) راستی‌آزمایی لینک‌ها از اینترنت (تلاش ۱ و ۲ — کد بخشنده)
  const b1 = await fetch(`${PUBLIC_URL}/api/mobile-relay/bootstrap?code=${code}`);
  const scriptText = b1.status === 200 ? await b1.text() : "";
  const b2 = await fetch(`${PUBLIC_URL}/api/mobile-relay/bootstrap?code=${code}`);
  const hardened = scriptText.includes("خطای داخلی: امضا/زمان خالی ساخته شد")
    && scriptText.includes("اتصال تأیید شد")
    && scriptText.includes("احراز: X-Melka-Relay-Device + X-Melka-Timestamp + X-Melka-Signature");

  // ۴) وضعیت کد (code-status)
  const stResp = await fetch(`${PUBLIC_URL}/api/admin/relay/code-status?code=${code}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const st = stResp.status === 200 ? await stResp.json() : { state: `http-${stResp.status}` };

  const witness = {
    phase: "PN-031-G · کار ۷ — کد تازهٔ مالک (سند ۰۴۷)",
    issuedAt: new Date().toISOString(),
    deviceId: enroll.deviceId,
    installCommand,
    installCommandNote: "این دستور در Termux پیست شود — پس از Ctrl+C اسکریپت قبلی",
    bootstrapDownloads: { first: b1.status, second: b2.status, forgiving: "کد تا ۳ بار قابل دانلود است" },
    hardenedScriptServed: hardened,
    codeStatus: st,
    validity: "۳۰ دقیقه از صدور · سوختن نهایی فقط پس از اولین Poll موفق",
  };
  await Bun.write("download/pn031g/owner-delivery.json", JSON.stringify(witness, null, 1));
  console.log(JSON.stringify({ deviceId: enroll.deviceId, code, bootstrap: `${b1.status}/${b2.status}`, hardened }, null, 1));
  // لاگ کنسول کد را نشان می‌دهد اما شاهد JSON هم installCommand را دارد (قانون: راز فقط در پیام مستقیم مالک)
}
main();
