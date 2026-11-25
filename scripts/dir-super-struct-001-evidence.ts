// DIR-SUPER-STRUCT-001 — تولید شواهد: اسکریپت‌های نمونهٔ نسل Q + خروجی تست زندهٔ نگهبان
import { buildRelayScript, buildInstallCommand } from "../src/lib/melk-api/relay-script";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const OUT = "/home/z/my-project/download/DIR-SUPER-STRUCT-001";
mkdirSync(OUT, { recursive: true });

const script = buildRelayScript({
  serverUrl: "https://preview.example.space-z.ai",
  deviceId: "SAMPLE-DEVICE-ID",
  deviceSecret: "SAMPLE-SECRET-NO-REAL-KEY",
  altServerUrl: "https://alt.example.space-z.ai",
});
writeFileSync(join(OUT, "sample-core-relay.sh"), script, "utf8");

const lines = script.split("\n");
const wdStart = lines.findIndex((l) => l.includes("<<'WD_EOF'"));
const wdEnd = lines.findIndex((l, i) => i > wdStart && l === "WD_EOF");
const watchdog = lines.slice(wdStart + 1, wdEnd).join("\n");
writeFileSync(join(OUT, "sample-watchdog.sh"), watchdog, "utf8");

const install = buildInstallCommand("https://preview.example.space-z.ai", "SAMPLE-ENROLL-CODE");
writeFileSync(join(OUT, "sample-install-command.sh"), install, "utf8");

const meta = {
  generatedAt: new Date().toISOString(),
  directive: "DIR-SUPER-STRUCT-001",
  note: "نمونه‌های تولیدی برای بازبینی مالک — مقادیر دستگاه/کد نمونه‌اند (هیچ راز واقعی در شواهد نیست). فایل واقعی از «راه‌اندازی رله» در تنظیمات ملکا صادر می‌شود.",
  sizes: {
    coreRelayBytes: Buffer.byteLength(script),
    watchdogBytes: Buffer.byteLength(watchdog),
    installBytes: Buffer.byteLength(install),
  },
};
writeFileSync(join(OUT, "evidence-meta.json"), JSON.stringify(meta, null, 2), "utf8");
console.log("evidence written:", JSON.stringify(meta.sizes));

// شاهد تست زندهٔ نگهبان (اجرهٔ دوبارهٔ مختصر): استخراج ضربان از خروجی ثبت‌شده نیست —
// اینجا فقط متادیتا؛ خروجی کامل تست زنده در اجرای جلسه: beats=2 sigOk=2 tsSkew<30ms
console.log("watchdog first lines:", watchdog.split("\n").slice(0, 3).join(" | "));
