/**
 * PN-051 · فرمان ۲ بند ۳ — تولید گزارش انتخاب منبع (endpoint-selection-report.md)
 * اجرا: bun run scripts/pn051/generate-endpoint-report.ts
 */
import { endpointSelectionReport } from "@/lib/column-source-map";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const REPO = process.env.MELKA_REPO_DIR ?? "/home/z/my-project";
mkdirSync(join(REPO, "download/PN-051"), { recursive: true });
const out = join(REPO, "download/PN-051/endpoint-selection-report.md");
writeFileSync(out, endpointSelectionReport(new Date()), "utf8");
console.log("OK →", out);
