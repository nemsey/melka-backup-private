// Validate نسل Q generated scripts: bash -n syntax + structural guards (DIR-SUPER-STRUCT-001)
import { buildRelayScript, buildInstallCommand } from "../src/lib/melk-api/relay-script";
import { writeFileSync, mkdtempSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

const dir = mkdtempSync(join(tmpdir(), "qcheck-"));
const script = buildRelayScript({
  serverUrl: "https://preview.example.space-z.ai",
  deviceId: "dev-123",
  deviceSecret: "sec-456",
  altServerUrl: "https://alt.example.space-z.ai",
});
const relayPath = join(dir, "core-relay.sh");
writeFileSync(relayPath, script, "utf8");

// 1) bash -n on the whole relay script
execSync(`bash -n ${relayPath}`);
console.log("OK bash -n core-relay");

// 2) Extract the watchdog heredoc (from "cat > ...watchdog.sh" until WD_EOF) and bash -n it
const lines = script.split("\n");
const wdStart = lines.findIndex((l) => l.includes("<<'WD_EOF'"));
const wdEnd = lines.findIndex((l, i) => i > wdStart && l === "WD_EOF");
if (wdStart < 0 || wdEnd < 0 || wdEnd <= wdStart + 5) throw new Error("watchdog heredoc not found");
const wdBody = lines.slice(wdStart + 1, wdEnd).join("\n");
writeFileSync(join(dir, "watchdog.sh"), wdBody, "utf8");
execSync(`bash -n ${join(dir, "watchdog.sh")}`);
console.log("OK bash -n watchdog extracted");

// 3) Extract device.env heredoc and confirm runtime interpolation markers
const envStart = lines.findIndex((l) => l.includes("<<ENV_EOF"));
const envEnd = lines.findIndex((l, i) => i > envStart && l === "ENV_EOF");
const envBody = lines.slice(envStart + 1, envEnd).join("\n");
console.log("ENV heredoc:", JSON.stringify(envBody));
if (!envBody.includes("SERVER_URL='$SERVER_URL'")) throw new Error("env heredoc interpolation broken");

// 4) install command syntax
const install = buildInstallCommand("https://preview.example.space-z.ai", "ENROLL-777");
const installPath = join(dir, "install.sh");
writeFileSync(installPath, install, "utf8");
execSync(`bash -n ${installPath}`);
console.log("OK bash -n install command");

// 5) show the watchdog body around heartbeat for eyeball
console.log("--- watchdog heartbeat section ---");
console.log(wdBody.split("\n").filter((l) => l.includes("wd_heartbeat") || l.includes("X-Melka-Signature") || l.includes("sleep 15") || l.includes("WD_ITER % 2")).join("\n"));
console.log("--- install key lines ---");
console.log(install.split("\n").filter((l) => l.includes("tmux new-session") || l.includes("core-relay.sh") || l.includes("sqlite tmux") || l.includes("watchdog")).join("\n"));
console.log("dir:", dir);
