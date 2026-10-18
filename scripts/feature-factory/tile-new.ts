/**
 * tile-new.ts — PN-022-A/مرحلهٔ۴: Feature Factory — مولد چهارلایهٔ کاشی
 * ---------------------------------------------------------------------------
 * سفارش شورا ۰۲۵ (PN-022-A مرحلهٔ۴): «Generator: bun run tile:new --name=contracts
 * · تولید Repository + Agent + API + Test»
 *
 * شش فایل از الگوی کاشی مرجع (market-index — سالم‌ترین الگو) تولید می‌شود:
 *   ۱) src/core/tiles/tiles/<name>/index.ts      — defineTile (بدون ثبت تا --register)
 *   ۲) src/core/tiles/tiles/<name>/<Name>Page.tsx — صفحهٔ lazy
 *   ۳) src/core/agent/<name>-agent.ts             — ایجنت سبک (الگوی TileLiteAgent)
 *   ۴) src/core/repositories/interfaces/<name>.repository.ts — قرارداد خالص مخزن
 *   ۵) src/app/api/<name>/route.ts                — روت لاغر + گارد نشست
 *   ۶) tests/pn022-tile-<name>.test.ts            — تست قرارداد اسکلت
 *
 * قیدها (سند طراحی فصل ۴.۳):
 *   - بدنه‌های منطق با TILE_SKELETON fail-loud — کاشی نیمه‌بند در رجیستری ممنوع
 *   - ثبت رجیستری فقط با --register صریح (پس از پیاده‌سازی منطق واقعی)
 *   - اجرای مجدد روی نام موجود = خطای صریح (صفر overwrite)
 *   - هر تولید در AuditLog با TILE_GENERATED مهر می‌خورد (بهترین-تلاش)
 *   - --target برای خشک‌سازی/گواه (درخت tmp) — بدون لمس src
 */
import { mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join, relative } from "node:path";

export interface TileNewOptions {
  /** نام kebab-case کاشی (مثل contracts) */
  name: string;
  /** ریشهٔ درخت مقصد (پیش‌فرض: ریشهٔ پروژه؛ برای گواه: tmp) */
  targetRoot?: string;
  /** ثبت در رجیستری bootstrap (فقط پس از پیاده‌سازی منطق واقعی) */
  register?: boolean;
  /** تولید مستندات شاهد JSON به‌جای چاپ */
  witnessPath?: string;
}

export interface TileNewResult {
  ok: boolean;
  name: string;
  pascal: string;
  files: Array<{ path: string; lines: number }>;
  register: boolean;
  totalLines: number;
}

/** تبدیل kebab-case → PascalCase (contracts → Contracts) */
export function kebabToPascal(name: string): string {
  return name
    .split("-")
    .map((s) => (s.length > 0 ? s[0]!.toUpperCase() + s.slice(1) : s))
    .join("");
}

/** اعتبارسنجی نام — عین قاعدهٔ defineTile: /^[a-z][a-z0-9-]*$/ */
export function isValidTileName(name: string): boolean {
  return /^[a-z][a-z0-9-]*$/.test(name) && name.length >= 3 && name.length <= 40;
}

/** مولد اصلی — هر دو مصرف: CLI (scripts/feature-factory/tile-new.ts) و تست */
export function generateTile(opts: TileNewOptions): TileNewResult {
  const name = opts.name;
  if (!isValidTileName(name)) {
    throw new Error(`نام کاشی نامعتبر: «${name}» — باید kebab-case باشد (a-z، رقم، خط تیره؛ ۳-۴۰ نویسه)`);
  }
  const pascal = kebabToPascal(name);
  const root = opts.targetRoot ?? process.cwd();
  const files: Array<{ path: string; lines: number }> = [];

  const writeIfAbsent = (rel: string, content: string) => {
    const abs = join(root, rel);
    if (existsSync(abs)) {
      throw new Error(`صفر overwrite: فایل موجود است — ${rel} (نام کاشی تکراری یا درخت کثیف)`);
    }
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, content, "utf8");
    files.push({ path: rel, lines: content.split("\n").length });
  };

  // ─── ۱) تعریف کاشی (بدون ثبت رجیستری مگر --register) ───
  const tileIndex = `/**
 * کاشی «${name}» — تولیدشده با Feature Factory (PN-022-A/مرحلهٔ۴)
 * ---------------------------------------------------------------------------
 * اسکلت قرارداد-کامل: این کاشی تا پیاده‌سازی منطق واقعی در رجیستری ثبت
 * نمی‌شود (قید TILE_SKELETON — سند طراحی فاز ۱۲ فصل ۴.۳).
 */
import { defineTile } from "@/core/tiles/tile-contract";
import { lazyPage } from "@/core/tiles/lazy-page";
import { ${pascal}Icon } from "lucide-react";

export const ${name}Tile = defineTile({
  id: "${name}",
  version: "0.1.0-skeleton",
  title: "کاشی ${pascal}",
  tagline: "تولید Feature Factory — نیازمند پیاده‌سازی منطق",
  description: "این کاشی با مولد bun run tile:new تولید شده است. منطق دامنه هنوز پیاده نشده (TILE_SKELETON).",
  icon: ${pascal}Icon,
  accent: "m7",
  component: lazyPage(() => import("./${pascal}Page")),
  order: 99,
  container: "management-dashboard",
  minRole: "OWNER",
  agent: {
    tileId: "${name}",
    insightDomains: ["${name.toUpperCase()}"],
    capabilities: ["memory", "feedback"],
  },
  settings: [],
});
${opts.register ? `\nimport { tileRegistry } from "@/core/tiles/tile-registry";\ntileRegistry.register(${name}Tile);\n` : "// ثبت رجیستری: پس از پیاده‌سازی منطق، با پرچم --register انجام می‌شود\n"};
`;
  writeIfAbsent(`src/core/tiles/tiles/${name}/index.ts`, tileIndex);

  // ─── ۲) صفحهٔ lazy ───
  const page = `/**
 * صفحهٔ کاشی «${name}» — اسکلت Feature Factory (TILE_SKELETON)
 */
import type { TilePageProps } from "@/core/tiles/tile-contract";

export default function ${pascal}Page({ onBack }: TilePageProps) {
  return (
    <div className="p-4 sm:p-6 space-y-4" data-testid="${name}-page">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">کاشی ${pascal} (اسکلت)</h2>
        <button onClick={onBack} className="text-sm text-muted-foreground" data-testid="${name}-back">بازگشت</button>
      </div>
      <p className="text-sm text-muted-foreground">
        این کاشی با Feature Factory تولید شده و هنوز منطق دامنه ندارد (TILE_SKELETON).
      </p>
    </div>
  );
}
`;
  writeIfAbsent(`src/core/tiles/tiles/${name}/${pascal}Page.tsx`, page);

  // ─── ۳) ایجنت سبک (الگوی TileLiteAgent — PN-014) ───
  const agent = `/**
 * ایجنت کاشی «${name}» — اسکلت Feature Factory (TILE_SKELETON)
 * الگوی TileLiteAgent (lite-agents.ts): سبک، صادق، گزارش‌دهندهٔ حلقهٔ بازخورد.
 */
import { BaseLearningAgent, type InsightCard } from "./base-agent";

export class ${pascal}Agent extends BaseLearningAgent {
  readonly tileId = "${name}";
  readonly name = "ایجنت ${pascal}";
  readonly insightDomains = ["${name.toUpperCase()}"] as const;

  protected async computeRawInsights(): Promise<InsightCard[]> {
    // اسکلت — پیاده‌سازی واقعی در PN-022-B (دادهٔ واقعی؛ صفر ساختگی)
    throw new Error("TILE_SKELETON: ایجنت «${name}» هنوز پیاده نشده است");
  }
}
`;
  writeIfAbsent(`src/core/agent/${name}-agent.ts`, agent);

  // ─── ۴) قرارداد مخزن خالص (بدون I/O — قابل‌تست) ───
  const repo = `/**
 * قرارداد مخزن کاشی «${name}» — اسکلت Feature Factory (TILE_SKELETON)
 * مرز مخزن (فاز ۳): اینترفیس خالص؛ پیاده‌سازی Prisma در prisma/*.repository.ts
 */
export interface ${pascal}Row {
  id: string;
  /** دادهٔ واقعی — پس از پیاده‌سازی دامنه تعریف می‌شود */
  dataJson: string;
  createdAt: Date;
}

export interface ${pascal}Repository {
  count(): Promise<number>;
  listRecent(limit: number): Promise<${pascal}Row[]>;
}

/** نمونهٔ اسکلت — همیشه خطای صریح (fail-loud) */
export function skeleton${pascal}Repository(): ${pascal}Repository {
  return {
    async count() {
      throw new Error("TILE_SKELETON: مخزن «${name}» هنوز پیاده نشده است");
    },
    async listRecent() {
      throw new Error("TILE_SKELETON: مخزن «${name}» هنوز پیاده نشده است");
    },
  };
}
`;
  writeIfAbsent(`src/core/repositories/interfaces/${name}.repository.ts`, repo);

  // ─── ۵) روت API لاغر (گارد نشست + سرویس اسکلت) ───
  const route = `/**
 * /api/${name} — GET — اسکلت Feature Factory (TILE_SKELETON)
 * الگوی روت لاغر PN-012 BLOCK 1: Auth + Service + Response.
 */
import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);
  return Response.json(
    { ok: false, message: "TILE_SKELETON: سرویس «${name}» هنوز پیاده نشده است" },
    { status: 501 },
  );
}
`;
  writeIfAbsent(`src/app/api/${name}/route.ts`, route);

  // ─── ۶) تست قرارداد اسکلت ───
  const test = `/**
 * تست قرارداد اسکلت کاشی «${name}» — تولید Feature Factory (PN-022-A/مرحلهٔ۴)
 * تا پیش از پیاده‌سازی منطق، این تست تنها «شکاف صریح» را گواهی می‌کند.
 */
import { describe, expect, test } from "bun:test";

describe("Feature Factory · اسکلت کاشی «${name}»", () => {
  test("ایجنت اسکلت fail-loud است (TILE_SKELETON)", async () => {
    const { ${pascal}Agent } = await import("@/core/agent/${name}-agent");
    const agent = new ${pascal}Agent();
    await expect(agent.computeRawInsights?.() ?? Promise.reject(new Error("TILE_SKELETON"))).rejects.toThrow("TILE_SKELETON");
  });

  test("مخزن اسکلت fail-loud است (TILE_SKELETON)", async () => {
    const { skeleton${pascal}Repository } = await import("@/core/repositories/interfaces/${name}.repository");
    const repo = skeleton${pascal}Repository();
    expect(() => repo.count()).toThrow("TILE_SKELETON");
  });

  test("قرارداد کاشی: id معتبر kebab-case", async () => {
    const { isValidTileName } = await import("@/scripts/feature-factory/tile-new");
    expect(isValidTileName("${name}")).toBe(true);
  });
});
`;
  writeIfAbsent(`tests/pn022-tile-${name}.test.ts`, test);

  const result: TileNewResult = {
    ok: true,
    name,
    pascal,
    files,
    register: Boolean(opts.register),
    totalLines: files.reduce((s, f) => s + f.lines, 0),
  };

  if (opts.witnessPath) {
    mkdirSync(join(opts.witnessPath, ".."), { recursive: true });
    writeFileSync(
      opts.witnessPath,
      JSON.stringify(
        {
          workOrder: "PN-022-A/مرحلهٔ۴ — Feature Factory",
          ranAt: new Date().toISOString(),
          command: `bun run tile:new --name=${name}${opts.register ? " --register" : ""}${opts.targetRoot ? " --target=" + opts.targetRoot : ""}`,
          ...result,
          guarantees: {
            failLoudSkeleton: "همهٔ بدنه‌های منطق TILE_SKELETON پرتاب می‌کنند",
            noRegistryLeak: "ثبت رجیستری فقط با --register (کاشی نیمه‌بند در UI نمی‌آید)",
            zeroOverwrite: "نام موجود = خطای صریح",
            auditTrail: "TILE_GENERATED در AuditLog (بهترین-تلاش)",
          },
        },
        null,
        2,
      ),
      "utf8",
    );
  }
  return result;
}

/* ─────────────── CLI ─────────────── */
const isDirectRun = process.argv[1]?.includes("tile-new");
if (isDirectRun) {
  const args = process.argv.slice(2);
  const argValue = (flag: string): string | undefined => {
    const eq = `--${flag}=`;
    const eqIdx = args.findIndex((a) => a.startsWith(eq));
    if (eqIdx >= 0) return args[eqIdx]!.slice(eq.length);
    const spIdx = args.indexOf(`--${flag}`);
    return spIdx >= 0 ? args[spIdx + 1] : undefined;
  };
  const name = argValue("name");
  if (!name) {
    console.error("استفاده: bun run tile:new --name=<kebab> [--target=dir] [--register] [--witness=file.json]");
    process.exit(2);
  }
  const register = args.includes("--register");
  const target = argValue("target");
  const witness = argValue("witness");
  try {
    const result = generateTile({ name, register, targetRoot: target, witnessPath: witness });
    console.log(`✓ کاشی «${name}» تولید شد — ${result.files.length} فایل · ${result.totalLines} خط · ثبت رجیستری: ${result.register ? "بله" : "نه (اسکلت)"}`);
    for (const f of result.files) console.log(`  · ${f.path} (${f.lines} خط)`);
    // مهر حسابرسی (بهترین-تلاش — تولید هرگز به‌خاطر آن نمی‌شکند)
    (async () => {
      try {
        const { PrismaClient } = await import("@prisma/client");
        const db = new PrismaClient();
        await db.auditLog.create({
          data: {
            action: "TILE_GENERATED",
            actor: "feature-factory:tile-new",
            detail: JSON.stringify({ name, register: Boolean(register), files: result.files.length, totalLines: result.totalLines, target: target ?? "src" }),
          },
        });
        await db.$disconnect();
      } catch { /* بهترین-تلاش */ }
    })();
  } catch (err) {
    console.error(`✗ ${(err as Error).message}`);
    process.exit(1);
  }
}
