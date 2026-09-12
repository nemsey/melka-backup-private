import { transactionAgent } from "@/core/agent/transaction-agent";
try {
  const r = await transactionAgent.renderInsights();
  console.log("OK", r.insights.length);
} catch (e) {
  console.log("ERR:", (e as Error).message, (e as Error).stack?.split("\n").slice(0, 6).join("\n"));
}
