// PN-036 · تولید اسکریپت نسل K و بررسی نحو bash
import { writeFileSync } from "node:fs";
import { buildRelayScript } from "../../src/lib/melk-api/relay-script";

const script = buildRelayScript({
  serverUrl: "https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai",
  deviceId: "test-device",
  deviceSecret: "a".repeat(64),
  altServerUrl: "",
});
writeFileSync("/tmp/pn036-relay-k.sh", script);
console.log("generated:", script.length, "chars ·", script.split("\n").length, "lines");
console.log("has rawfile:", script.includes("--rawfile b64"));
console.log("has stdin merge:", script.includes('cat "$RESULTS_DIR"/*.json 2>/dev/null | jq'));
console.log("BATCH=20:", script.includes("BATCH=20"));
console.log("is_interactive:", script.includes("is_interactive"));
console.log("express lane:", script.includes('contains("/authentication/otp")'));
console.log("timeout retry:", script.includes("-eq 28 ]"));
