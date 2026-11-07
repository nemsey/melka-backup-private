#!/usr/bin/env bun
/** p6515-insight-verify.ts — راستی‌آزمایی زندهٔ کارت‌های بینش tc-trend/tc-top-experts (بدون روت لاگین) */
import { createSession } from "../src/lib/auth/session";
import { NextRequest } from "next/server";

async function main() {
  const { token } = await createSession(
    { personnelCode: "410031320", displayName: "مالک (راستی‌آزمایی)", role: "OWNER" },
    { ip: "127.0.0.1" },
    null
  );
  const route = await import("../src/app/api/agent/[tileId]/insight/route");
  const req = new NextRequest("http://localhost/api/agent/transactions-contracts/insight", {
    headers: { authorization: `Bearer ${token}` },
  });
  const res = await route.GET(req, { params: Promise.resolve({ tileId: "transactions-contracts" }) });
  const body = (await res.json()) as { ok: boolean; cards?: { key: string; title: string; body: string; metrics: { label: string; value: string }[] }[]; insights?: { key: string; title: string; body: string; metrics: { label: string; value: string }[] }[]; message?: string };
  const cards = body.cards ?? body.insights ?? [];
  console.log("status:", res.status, "| ok:", body.ok, "| cards:", cards.length, body.message ?? "");
  for (const c of cards) {
    if (c.key === "tc-trend" || c.key === "tc-top-experts") {
      console.log("\nKEY:", c.key, "|", c.title);
      console.log("  METRICS:", c.metrics.map((m) => `${m.label}=${m.value}`).join(" · "));
      console.log("  BODY:", c.body.slice(0, 320) + "…");
    }
  }
}
main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
