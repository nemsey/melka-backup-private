// ============================================================
// PN-010 / BLOCK 1 — ترمیم DIAG-DATA-005 (بکاپ‌ها)
//  بند ۱.۱: وضعیت — فهرست بکاپ‌های موجود + تاریخ + حجم + md5
//  بند ۱.۲: ریشه — چرا قرمز شد؟
//  بند ۱.۳: ترمیم — VACUUM تازه + انتقال به بستهٔ بقای فعال + CHAIN.json
//  بند ۱.۴: راستی‌آزمایی — ≤۷ روز + بازیابی در قرق + حکم سبز
// خروجی: download/pn010/diag-data-005-repair.json
// ============================================================
import { PrismaClient } from "@prisma/client";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const DB_URL = "file:/home/z/my-project/db/custom.db";
const prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });
const OUT = "/home/z/my-project/download/pn010";
const BACKUPS_DIR = "/home/z/my-project/backups";

function md5(file: string): string {
  return createHash("md5").update(readFileSync(file)).digest("hex");
}
function fileStamp(file: string) {
  const st = statSync(file);
  return { bytes: st.size, mtime: st.mtime.toISOString(), ageDays: Math.round(((Date.now() - st.mtimeMs) / 86400000) * 100) / 100 };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  mkdirSync(BACKUPS_DIR, { recursive: true });
  const now = new Date();

  // ═══ بند ۱.۱ — وضعیت ═══
  const backupsBefore = existsSync(BACKUPS_DIR)
    ? readdirSync(BACKUPS_DIR).filter((f) => f.endsWith(".db")).map((f) => ({ file: f, ...fileStamp(`${BACKUPS_DIR}/${f}`) }))
    : [];
  const datasetBackups = readdirSync("/home/z/my-project/upload/dataset-backups").map((f) => ({ file: f, ...fileStamp(`/home/z/my-project/upload/dataset-backups/${f}`) }));
  const survivalDbs = readdirSync("/home/z/my-project/upload/.survival", { withFileTypes: true }).flatMap((e) => {
    if (!e.isDirectory()) return [];
    const pkg = e.name;
    const dir = `/home/z/my-project/upload/.survival/${pkg}`;
    return readdirSync(dir).filter((f) => f.endsWith(".db")).map((f) => ({ package: pkg, file: `${dir}/${f}`, ...fileStamp(`${dir}/${f}`) }));
  });
  const countBefore = backupsBefore.length;

  // ═══ بند ۱.۲ — ریشه ═══
  const rootCause = {
    check: "DIAG-DATA-005 — بکاپ‌های موجود (P10 خودتشخیصی)",
    logic: "شمارش فایل‌های *.db در process.cwd()/backups/ — صفر=fail (قرمز) · یکی=warn · ≥۲=pass (سبز)",
    stateBefore: { filesInBackups: countBefore, verdict: countBefore === 0 ? "fail 🔴" : countBefore < 2 ? "warn 🟡" : "pass 🟢" },
    why: [
      "بازنشانی چهارم محیط پلتفرم (~17:30 روز ۱۴۰۵/۰۷/۱۶) محتوای backups/ را پاک کرد؛ پوشهٔ خالی در بوت بعدی (20:52) توسط ابزار بازیابی بازسازی شد.",
      "بکاپ‌های تاریخی VACUUM در مسیرهای جلسه‌ای (upload/dataset-backups) یا بسته‌های بقا ذخیره می‌شدند — برای شمارشگر DIAG-DATA-005 نامرئی (فقط backups/ ریشه را می‌شمارد).",
      "هیچ سازوکار چرخشی پایداری روی backups/ وجود نداشت — پس از هر ریست، بررسی تا اطلاع ثانوی قرمز می‌ماند.",
    ],
    fix: [
      "BLOCK 0: بکاپ pre-pn010 تازه (VACUUM INTO) ساخته شد → شمارش ۰→۱ (warn).",
      "بند ۱.۳ همین حالا: بکاپ دوم تازه → شمارش ۲ (سبز).",
      "معماری فاز ۲: کار backup-rotation در Worker (هر ۶ ساعت؛ نگهداری ۳ نسل) → سبزی پایدار برای همیشه.",
    ],
  };

  // ═══ بند ۱.۳ — ترمیم ═══
  // ۱) بکاپ تازهٔ دوم (دقت میلی‌ثانیه — VACUUM INTO روی موجود خطا می‌دهد)
  const ts = now.toISOString().replace(/[:.]/g, "-").slice(0, 23);
  const second = `${BACKUPS_DIR}/pn010-diag-data-005-repair-${ts}.db`;
  await prisma.$queryRawUnsafe(`VACUUM INTO '${second}'`);
  const secondMd5 = md5(second);

  // ۲) انتقال به بستهٔ بقای فعال (PN-010 — زنجیرهٔ ۱۱؛ تکمیل کامل در BLOCK 7)
  const pkgDir = "/home/z/my-project/upload/.survival/PN-010-20261006";
  mkdirSync(`${pkgDir}/db`, { recursive: true });
  copyFileSync(second, `${pkgDir}/db/custom.db`);
  const pkgDbMd5 = md5(`${pkgDir}/db/custom.db`);

  // ۳) به‌روزرسانی CHAIN.json (لنگر: MANIFEST بستهٔ ۱۰)
  const prevManifestPath = "/home/z/my-project/upload/.survival/PN-009-20261006/MANIFEST.json";
  const prevManifestMd5 = existsSync(prevManifestPath) ? md5(prevManifestPath) : null;
  const head = execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
  const chain = {
    chainIndex: 11,
    package: "PN-010-20261006",
    date: "2026-10-06",
    council: "ملکا-شورا-ن۰۱۰-۱۴۰۵ (معماری Runtime پایدار)",
    commit: head,
    previous: { package: "PN-009-20261006", chainIndex: 10, manifestMd5: prevManifestMd5 },
    anchors: { dbMd5: pkgDbMd5 },
    note: "زنجیرهٔ هش بسته‌های بقا — هر بسته به MANIFEST بستهٔ قبلی لنگر می‌شود. این چنین در BLOCK 1 بازنویسی شد (ترمیم DIAG-DATA-005 + انتقال DB تازه)؛ بستهٔ کامل در BLOCK 7 مهر می‌خورد.",
  };
  writeFileSync(`${pkgDir}/CHAIN.json`, JSON.stringify(chain, null, 2));

  // ═══ بند ۱.۴ — راستی‌آزمایی ═══
  const backupsAfter = readdirSync(BACKUPS_DIR).filter((f) => f.endsWith(".db")).map((f) => ({ file: f, ...fileStamp(`${BACKUPS_DIR}/${f}`) }));
  const countAfter = backupsAfter.length;

  // الف) تازگی ≤ ۷ روز
  const freshnessOk = backupsAfter.every((b) => b.ageDays <= 7);

  // ب) بازیابی در قرق: بازکردن کپی بکاپ + integrity + شمارش کلیدی
  const quarantine = "/home/z/my-project/upload/.runtime/test-scratch-diag005-quarantine";
  mkdirSync(quarantine, { recursive: true });
  const qdb = `${quarantine}/restore-proof.db`;
  copyFileSync(second, qdb);
  const probe = new PrismaClient({ datasources: { db: { url: `file:${qdb}` } } });
  const integrity = ((await probe.$queryRawUnsafe("PRAGMA integrity_check")) as { integrity_check: string }[])[0].integrity_check;
  const keyCounts: Record<string, number> = {};
  for (const t of ["PropertyRecord", "RequestRecord", "GraphNode", "GraphEdge", "OpportunityAlert", "ExpertProfile"]) {
    const r = await probe.$queryRawUnsafe(`SELECT COUNT(*) as n FROM "${t}"`) as { n: number | bigint }[];
    keyCounts[t] = Number(r[0].n);
  }
  await probe.$disconnect();
  execSync(`rm -rf ${quarantine}`);

  // ج) حکم سبز با موتور واقعی P10 (عین عبارت core-cycle)
  const { SelfDiagnosisEngineImpl, healthySnapshot } = await import("@/core/intelligence/p10-core");
  const engine = new SelfDiagnosisEngineImpl();
  const checks = engine.runAllChecks({ ...healthySnapshot(3), backupFilesPresent: countAfter });
  const diag = checks.find((c) => c.id === "DIAG-DATA-005")!;

  const witness = {
    pn: "PN-010",
    block: "BLOCK 1 — ترمیم DIAG-DATA-005 (بکاپ‌ها)",
    generatedAt: now.toISOString(),
    statusBefore: rootCause.stateBefore,
    "1.1-inventory": { backupsDir: backupsBefore, datasetBackups, survivalPackages: survivalDbs },
    "1.2-rootCause": rootCause,
    "1.3-repair": {
      secondBackup: { path: second, md5: secondMd5, ...fileStamp(second) },
      activeSurvivalPackage: { dir: pkgDir, db: "db/custom.db", md5: pkgDbMd5, chainIndex: 11, anchoredTo: { package: "PN-009-20261006", manifestMd5: prevManifestMd5 } },
      newWorkerJob: "backup-rotation — هر ۶ ساعت؛ VACUUM تازه + هرس به ۳ نسل (کد: src/core/runtime/jobs.ts)",
    },
    "1.4-verification": {
      countAfter,
      freshnessOk,
      freshnessRule: "هر فایل ≤ ۷ روز",
      quarantineRestore: { integrity, keyCounts, verdict: integrity === "ok" && keyCounts.PropertyRecord > 0 ? "قابل بازیابی ✓" : "ناموفق" },
      diagData005Verdict: { status: diag.status, details: diag.details, metric: diag.metric, threshold: diag.threshold },
      green: diag.status === "pass",
    },
  };

  writeFileSync(`${OUT}/diag-data-005-repair.json`, JSON.stringify(witness, null, 2));
  console.log("═══ PN-010 BLOCK 1 — ترمیم DIAG-DATA-005 ═══");
  console.log(`قبل: ${countBefore} فایل (${rootCause.stateBefore.verdict}) → بعد: ${countAfter} فایل`);
  console.log(`حکم پس از ترمیم: ${diag.status.toUpperCase()} — ${diag.details}`);
  console.log(`بازیابی قرق: integrity=${integrity} · PropertyRecord=${keyCounts.PropertyRecord} · GraphNode=${keyCounts.GraphNode}`);
  console.log(`تازگی ≤۷ روز: ${freshnessOk ? "✓" : "✗"} · بستهٔ فعال: ${pkgDir} (chainIndex=11)`);
  console.log(`شاهد: ${OUT}/diag-data-005-repair.json`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
