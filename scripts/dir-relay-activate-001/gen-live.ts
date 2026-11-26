import { buildRelayScript } from "../../src/lib/melk-api/relay-script";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const dev = JSON.parse(readFileSync("/home/z/my-project/scripts/dir-relay-activate-001/device.json", "utf8"));
const script = buildRelayScript({
  serverUrl: "http://localhost:3000",
  deviceId: dev.deviceId,
  deviceSecret: dev.secret,
  altServerUrl: "",
});
mkdirSync("/home/z/my-project/scripts/dir-relay-activate-001/home/melka-relay", { recursive: true });
writeFileSync("/home/z/my-project/scripts/dir-relay-activate-001/home/melka-relay/core-relay.sh", script);
console.log("script written, bytes:", script.length);
