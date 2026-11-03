// PN-035 · دیباگ B-1 — بازتولید دستی امضای نتیجهٔ gzip
import { buildRelayScript } from "../../src/lib/melk-api/relay-script";
import { createHash, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

const SECRET = "a".repeat(64);
const DIR = "/tmp/pn035-dbg";

const p = Bun.spawn(["python3", "scripts/pn035/stub-relay-server.py", "0", `${DIR}/state.json`, `${DIR}/rec.jsonl`, SECRET], {
  stdout: "pipe",
  stderr: "ignore",
  cwd: "/home/z/my-project",
});
const reader = (p.stdout as unknown as ReadableStream<Uint8Array>).getReader();
const { value } = await reader.read();
await reader.cancel();
const port = parseInt(new TextDecoder().decode(value ?? new Uint8Array()).trim().split(/\s+/).pop() ?? "0", 10);
console.log("port:", port);

await Bun.write(`${DIR}/relay.sh`, buildRelayScript({ serverUrl: `http://127.0.0.1:${port}`, deviceId: "dbg-dev", deviceSecret: SECRET }));
const s = Bun.spawn(["bash", "-c", `exec bash ${DIR}/relay.sh > ${DIR}/log 2>&1`], {
  env: { ...process.env, HOME: `${DIR}/home` },
  cwd: "/home/z/my-project",
});

const deadline = Date.now() + 30_000;
let recs: any[] = [];
while (Date.now() < deadline) {
  try {
    recs = readFileSync(`${DIR}/rec.jsonl`).toString().split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
    if (recs.some((r) => r.kind === "result")) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 300));
}
s.kill();
p.kill();

const res = recs.find((r) => r.kind === "result");
if (!res) {
  console.log("NO RESULT RECORD. log tail:");
  console.log(readFileSync(`${DIR}/log`).toString().split("\n").slice(-10).join("\n"));
  process.exit(1);
}
console.log("result records:", recs.filter((r) => r.kind === "result").length, "· poll records:", recs.filter((r) => r.kind === "poll").length);
console.log("content-encoding:", res.headers["content-encoding"]);

const wire = Buffer.from(res.body_b64, "base64");
console.log("wire bytes:", wire.length, "· magic:", wire.subarray(0, 2).toString("hex"), "(1f8b = gzip)");
const digest = createHash("sha256").update(wire).digest("hex");
const ts = res.headers["x-melka-timestamp"];
const expectSig = createHmac("sha256", SECRET).update(`POST\n/api/mobile-relay/result\n${digest}\n${ts}`).digest("hex");
console.log("expected sig:", expectSig);
console.log("received sig:", res.headers["x-melka-signature"]);
console.log("MATCH:", expectSig === res.headers["x-melka-signature"]);
console.log("--- script log tail ---");
console.log(readFileSync(`${DIR}/log`).toString().split("\n").slice(-6).join("\n"));
process.exit(0);
