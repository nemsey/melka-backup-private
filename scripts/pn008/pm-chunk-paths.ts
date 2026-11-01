#!/usr/bin/env bun
/** استخراج مسیرهای API از چانک‌های PM — الگوی کامل (هر رشتهٔ شبیه مسیر) */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
const files = readdirSync("/tmp").filter((f) => f.startsWith("chunk-"));
const paths = new Set<string>();
for (const f of files) {
  const t = readFileSync("/tmp/" + f, "utf-8");
  for (const m of t.matchAll(/["'`](\/?[a-z][a-z0-9\-]*(?:\/[a-z0-9\-{}:._$A-Za-z]+){1,8})["'`]/g)) paths.add(m[1]);
  for (const m of t.matchAll(/["'`](\/?api\/[^"'`\s]{2,140})["'`]/g)) paths.add(m[1]);
}
const all = [...paths].filter((p) => !/\.(png|jpe?g|svg|css|woff2?|ico|webp|map|gif|mp4)$/i.test(p)).sort();
writeFileSync("/tmp/pm-chunk-paths.json", JSON.stringify(all, null, 1));
console.log("files:", files.length, "total:", all.length);
console.log(all.join("\n"));
