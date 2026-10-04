// p6549-coverage-snapshot.ts — وضعیت لحظه‌ای پوشش ستون‌ها از دید خود اپ + وضعیت اتصال‌ها
export {};
const BASE = process.argv[2] ?? "http://localhost:3000";
async function j(path: string, opts: RequestInit = {}) {
  const res = await fetch(BASE + path, opts);
  let body: any = null;
  try { body = await res.json(); } catch {}
  return { status: res.status, body };
}
async function main() {
  const login = await j("/api/auth/master-login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ masterCode: "00000000" }) });
  const H = { authorization: `Bearer ${login.body?.token ?? ""}` };
  const cov = await j("/api/coverage", { headers: H });
  console.log("coverage status:", cov.status);
  if (cov.status === 200) {
    const fs = await import("node:fs");
    fs.writeFileSync("download/p6549/coverage-endpoint.json", JSON.stringify(cov.body, null, 2));
    const b = cov.body;
    for (const tileKey of Object.keys(b?.tiles ?? b ?? {})) {
      const t = (b?.tiles ?? b)[tileKey];
      const cols = t?.columns ?? t?.coverage ?? [];
      console.log(`\n== ${tileKey} ==`);
      for (const c of cols) console.log(`  ${String(c.title ?? c.key).padEnd(22)} ${String(c.pct ?? c.percent ?? "?").padStart(6)}  (${c.filled ?? "?"}/${c.total ?? "?"})`);
    }
  } else {
    console.log(JSON.stringify(cov.body).slice(0, 400));
  }
  process.exit(0);
}
main().catch((e) => { console.error("ERR", e); process.exit(1); });
