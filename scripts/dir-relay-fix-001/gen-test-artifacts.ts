// DIR-RELAY-FIX-001 — تولید اسکریپت رله برای تست bash -n و تست دودویی
// استفاده: bun run gen-test-artifacts.ts [serverUrl] [outDir]
//   پیش‌فرض: URL پیش‌نمایش عمومی · خروجی: /tmp/dir-relay-fix-001/
import { buildRelayScript, buildInstallCommand } from "../../src/lib/melk-api/relay-script";
import { writeFileSync, mkdirSync } from "fs";

const serverUrl = process.argv[2] ?? "https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai";
const outDir = process.argv[3] ?? "/tmp/dir-relay-fix-001";
mkdirSync(outDir, { recursive: true });

const script = buildRelayScript({
  serverUrl,
  deviceId: "poco-f3-abc123",
  deviceSecret: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  altServerUrl: "",
});
writeFileSync(`${outDir}/melka-relay.sh`, script, { mode: 0o700 });
console.log("script bytes:", script.length);

const cmd = buildInstallCommand(serverUrl, "aabbccddeeff00112233445566778899aabbcc");
writeFileSync(`${outDir}/install-command.sh`, cmd);
console.log("--- install command ---");
console.log(cmd);
