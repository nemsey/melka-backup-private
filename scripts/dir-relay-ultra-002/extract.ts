// DIR-RELAY-ULTRA-002 · استخراج اسکریپت تولیدی برای وارسی دستی و bash -n
import { buildRelayScript, buildInstallCommand } from "/home/z/my-project/src/lib/melk-api/relay-script";
import { writeFileSync, mkdirSync } from "node:fs";

const OUT = "/tmp/relay-ultra-002";
mkdirSync(OUT, { recursive: true });
const core = buildRelayScript({ serverUrl: "http://localhost:3000", deviceId: "sandbox-verify-002", deviceSecret: "b".repeat(64), altServerUrl: "" });
const install = buildInstallCommand("https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai", "deadbeefcafe0123456789abcdef99");
writeFileSync(OUT + "/core-relay.sh", core, "utf8");
writeFileSync(OUT + "/install.sh", install, "utf8");
console.log("core bytes:", core.length, "install bytes:", install.length);
