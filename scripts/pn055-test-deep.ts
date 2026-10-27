console.log("[t] شروع...");
const { syncMelketunDeep } = await import("@/lib/integrations/melketun/deep");
console.log("[t] ماژول بارگذاری شد");
const r = await syncMelketunDeep();
console.log("[t] نتیجه:", JSON.stringify(r, null, 1));
process.exit(0);
