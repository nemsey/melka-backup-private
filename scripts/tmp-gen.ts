import { buildInstallCommand, buildRelayScript } from "../src/lib/melk-api/relay-script";
import { writeFileSync } from "node:fs";
const URL = "https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai";
const cmd = buildInstallCommand(URL, "deadbeefcafe0123456789abcdef0123");
const core = buildRelayScript({ serverUrl: "http://localhost:3000", deviceId: "sandbox-verify-001", deviceSecret: "a".repeat(64), altServerUrl: "" });
writeFileSync("/tmp/install-cmd.sh", cmd, "utf8");
writeFileSync("/tmp/core-relay.sh", core, "utf8");
console.log(JSON.stringify({ installBytes: cmd.length, coreBytes: core.length }));
