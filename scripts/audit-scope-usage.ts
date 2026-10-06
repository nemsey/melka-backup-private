/**
 * audit-scope-usage.ts — گارد ساختاری دامنه (P6.5-04-i، فاز ۱ دستور چهارفازی)
 * ---------------------------------------------------------------------------
 * منع فیلتر دامنهٔ «دست‌نویس» خارج از لایهٔ مجاز — معادل AST/ESLint دستورِ
 * «ممنوعیت where: { expertId: session.userId }» با نگاشت به ستون‌های واقعی
 * این کُدبیس (actorCode / ownerCode / branchId — قرارداد §۵.۳).
 *
 * دو قاعدهٔ اسکن (AST واقعی — TypeScript Compiler API):
 *  A) هر property با نام ستون دامنه «داخل زیردرخت where:» ⇒ نقض
 *     (مقدار هرچه باشد — even متغیر میانی؛ دامنه فقط از helper می‌آید)
 *  B) property با نام ستون دامنه که مقدارش به نشست (guard/session/ctx)
 *     ارجاع دهد و نزدیک‌ترین فراخوانیِ دربرگیرنده، فراخوانی خواندن/فیلتر
 *     باشد (findMany/findFirst/findUnique/count/groupBy/aggregate/
 *     deleteMany/updateMany) ⇒ نقض
 *
 * مجازها (provenance نوشتاری — ثبت کاربرِ عمل‌کننده روی رکورد، نه فیلتر):
 *  - فراخوانی‌های نوشتن (create, append, upsert, insert, log, record, save)
 *  - اشیای بدون فراخوانی دربرگیرنده (متادیتای نشست — session.ts)
 *  - فایل‌های allowlist: helper مرکزی + مخازن scope-دار core/repositories
 *
 * خروجی: PASS (exit 0) یا گزارش نقض فایل:خط (exit 1).
 * استفاده: bun scripts/audit-scope-usage.ts [--strict]
 */
import { readdirSync, statSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const ROOT = join(import.meta.dir, "..", "src");

/** لایه‌های مجاز به ساخت شرط دامنه (تک‌نقطهٔ تصمیم + مخازن scope-دار) */
const ALLOWLIST: readonly string[] = [
  "lib/access/scope.ts", // helper مرکزی — خاستگاه مجاز شرط دامنه
  "core/repositories/", // پیاده‌سازی‌های findWithScope (قرارداد §۶.۲)
];

/** ستون‌های انتساب دامنه (قرارداد §۵.۳) */
const SCOPE_COLUMNS = new Set(["actorCode", "ownerCode", "branchId"]);
/** شناسه‌های نشست درخواست‌کننده در مسیرها */
const SESSION_IDENTS = new Set(["guard", "session", "ctx"]);
/** فراخوانی‌های خواندن/فیلتر — آرگومان‌شان where است */
const READ_CALLS = new Set([
  "findMany", "findFirst", "findUnique", "findFirstOrThrow", "findUniqueOrThrow",
  "count", "groupBy", "aggregate", "deleteMany", "updateMany",
]);
/** الگوی نام فراخوانی‌های نوشتن (provenance مجاز) */
const WRITE_CALL_RE = /create|append|upsert|insert|log|record|save|register|reject|witness|audit/i;

interface Violation {
  file: string;
  line: number;
  rule: "A" | "B";
  code: string;
}

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...listTsFiles(full));
    else if (name.endsWith(".ts") || name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

function isAllowed(relPath: string): boolean {
  return ALLOWLIST.some((a) => relPath === a || relPath.startsWith(a));
}

/** آیا نود (بازگشتی) به شناسهٔ نشست ارجاع می‌دهد؟ */
function referencesSessionIdent(node: ts.Node): boolean {
  if (ts.isIdentifier(node) && SESSION_IDENTS.has(node.text)) return true;
  let found = false;
  node.forEachChild((c) => {
    if (!found && referencesSessionIdent(c)) found = true;
  });
  return found;
}

/** نام فراخوانی: findMany → "findMany" · this.client.expertRecord.findUnique → "findUnique" */
function callName(expr: ts.Expression): string {
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text;
  return "";
}

/** نزدیک‌ترین اجداد CallExpression — برای تشخیص زمینهٔ نوشتن/خواندن */
function nearestCallName(node: ts.Node, sf: ts.SourceFile): string | null {
  let cur: ts.Node = node;
  while (cur.parent) {
    cur = cur.parent;
    if (ts.isCallExpression(cur)) return callName(cur.expression);
  }
  return null;
}

/** اسکن زیردرخت یک where برای ستون‌های دامنه */
function scanWhereSubtree(node: ts.Node, sf: ts.SourceFile, relPath: string, out: Violation[], prefix = "where."): void {
  if (ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) {
    const name = node.name.getText(sf).replace(/^["']|["']$/g, "");
    if (SCOPE_COLUMNS.has(name)) {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      out.push({
        file: relPath,
        line: line + 1,
        rule: "A",
        code: `${prefix}${name}`,
      });
    }
  }
  node.forEachChild((c) => scanWhereSubtree(c, sf, relPath, out, prefix));
}

function scanFile(path: string): Violation[] {
  const relPath = relative(ROOT, path).split("\\").join("/");
  if (isAllowed(relPath)) return [];
  const text = readFileSync(path, "utf8");
  const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const violations: Violation[] = [];

  const visit = (node: ts.Node): void => {
    // قاعده A — where: زیردرختش ستون دامنه دارد (مقدار مهم نیست)
    if (ts.isPropertyAssignment(node) && node.name.getText(sf) === "where") {
      scanWhereSubtree(node.initializer, sf, relPath, violations);
    }
    // قاعده B — ستون دامنه با ارجاع نشست داخل فراخوانی خواندن
    if (ts.isPropertyAssignment(node)) {
      const name = node.name.getText(sf).replace(/^["']|["']$/g, "");
      if (SCOPE_COLUMNS.has(name) && referencesSessionIdent(node.initializer)) {
        const enclosing = nearestCallName(node, sf);
        // فراخوانی نوشتن = provenance مجاز؛ فراخوانی خواندن = فیلتر دست‌نویس
        if (enclosing && READ_CALLS.has(enclosing)) {
          const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
          violations.push({ file: relPath, line: line + 1, rule: "B", code: `${name} (در فراخوانی ${enclosing})` });
        }
      }
    }
    node.forEachChild(visit);
  };
  visit(sf);
  return violations;
}

const files = listTsFiles(ROOT);
const all: Violation[] = [];
for (const f of files) all.push(...scanFile(f));

if (all.length > 0) {
  console.error("✗ AUDIT-SCOPE-USAGE FAIL — فیلتر دامنهٔ دست‌نویس خارج از helper مرکزی:");
  for (const v of all) console.error(`  [${v.rule}] ${v.file}:${v.line}  ${v.code}`);
  console.error(`\nقانون P6.5-04-i: دامنه فقط از src/lib/access/scope.ts (resolveEntityAccess/personalScopeWhere).`);
  process.exit(1);
}

console.log(
  `✓ AUDIT-SCOPE-USAGE PASS — ${files.length} فایل اسکن شد؛ صفر فیلتر دامنهٔ دست‌نویس ` +
    `(قاعده A: ستون‌های actorCode/ownerCode/branchId داخل where · قاعده B: ارجاع نشست در فراخوانی‌های خواندن).`
);
