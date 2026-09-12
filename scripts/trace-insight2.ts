import { ensureSeeded } from "@/lib/melk-api/sync";
import { visitsAgent } from "@/core/agent/visits-agent";
import { extractionAgent } from "@/core/agent/extraction-agent";
try {
  const s = await ensureSeeded();
  console.log("seed:", JSON.stringify(s));
} catch (e) { console.log("SEED ERR:", (e as Error).message); }
for (const a of [visitsAgent, extractionAgent]) {
  try {
    const r = await a.renderInsights();
    console.log(a.tileId, "OK", r.insights.length);
  } catch (e) {
    console.log(a.tileId, "ERR:", (e as Error).message);
    console.log((e as Error).stack?.split("\n").slice(0, 5).join("\n"));
  }
}
