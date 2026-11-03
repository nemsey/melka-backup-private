// PN-035 · اعتبارسنجی — تولید اسکریپت نسل J و بررسی نحوی bash
// خروجی: /tmp/relay-j-preview.sh (برای bash -n و بازرسی)
import { buildRelayScript, buildInstallCommand } from "../../src/lib/melk-api/relay-script";
import { writeFileSync } from "node:fs";

const script = buildRelayScript({
  serverUrl: "https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai",
  deviceId: "test-device-1234",
  deviceSecret: "testsecret_ABCDEF123",
  altServerUrl: "",
});
writeFileSync("/tmp/relay-j-preview.sh", script, "utf8");
console.log("script bytes:", script.length);
console.log("install cmd:", buildInstallCommand("https://x.example", "CODE123"));
