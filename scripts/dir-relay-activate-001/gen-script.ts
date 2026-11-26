import { buildRelayScript } from "../../src/lib/melk-api/relay-script";
import { writeFileSync } from "node:fs";
const script = buildRelayScript({
  serverUrl: "https://melka.example.com",
  deviceId: "dev-12345678",
  deviceSecret: "secret-abcdef0123456789",
  altServerUrl: "",
});
writeFileSync("/home/z/my-project/scripts/dir-relay-activate-001/core-relay.sh", script);
console.log("bytes:", script.length);
