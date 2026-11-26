import { buildInstallCommand } from "../../src/lib/melk-api/relay-script";
import { readFileSync, writeFileSync } from "node:fs";
const dev = JSON.parse(readFileSync("scripts/dir-relay-activate-001/device2.json", "utf8"));
const cmd = buildInstallCommand("https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai", dev.enrollCode);
writeFileSync("scripts/dir-relay-activate-001/install-cmd.sh", cmd);
console.log("install command written, bytes:", cmd.length);
