import { globSync } from "node:fs";
const glob = new Bun.Glob("src/app/api/**/route.ts");
const offenders: string[] = [];
for (const file of glob.scanSync({ cwd: process.cwd() })) {
  const text = await Bun.file(file).text();
  if (text.includes('from "@/lib/db"') && !text.includes('await import("@/lib/db")')) offenders.push(file + " (db import)");
  else if (/^import .*from "@\/lib\/db"/m.test(text)) offenders.push(file + " (top db import)");
  if (text.includes('from "@prisma/client"') && !text.includes('import type')) offenders.push(file + " (prisma import)");
  if (/\b00000000\b/.test(text)) offenders.push(file + " (00000000)");
}
console.log(offenders.length ? offenders.join("\n") : "CLEAN");
