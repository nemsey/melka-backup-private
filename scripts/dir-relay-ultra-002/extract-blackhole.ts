// DIR-RELAY-ULTRA-002 · اسکریپت تولیدی با سرورِ شب‌تار (پورت ۹ بسته) برای حالت A/B
import { buildRelayScript } from "/home/z/my-project/src/lib/melk-api/relay-script";
import { writeFileSync, mkdirSync } from "node:fs";

const OUT = "/tmp/relay-ultra-002-bh";
mkdirSync(OUT, { recursive: true });
const core = buildRelayScript({ serverUrl: "http://127.0.0.1:9", deviceId: "sandbox-blackhole-002", deviceSecret: "c".repeat(64), altServerUrl: "" });
writeFileSync(OUT + "/core-relay.sh", core, "utf8");
console.log("black-hole core bytes:", core.length);
