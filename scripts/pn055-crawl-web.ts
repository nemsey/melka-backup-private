/**
 * PN-055 — خزندهٔ وب‌سایت عمومی ملکتون (فاز A-۳)
 * کشف: هر صفحهٔ آگهی عمومی (بدون احراز هویت) آبجکت owner دارد:
 *   {name, mobile, is_verified} = کارشناس ثبت‌کننده — هر دو شعبه (رضانژاد + آسمان)
 * خروجی: download/pn055/website-filers.jsonl — filer نام+موبایل به‌ازای هر کد آگهی
 * اجرا (دیمن): python3 scripts/pn055-launch-web.py
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from "fs";

const OUT_DIR = "download/pn055";
const JSONL = `${OUT_DIR}/website-filers.jsonl`;
const STATUS = `${OUT_DIR}/crawl-web-status.json`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

mkdirSync(OUT_DIR, { recursive: true });
const PUB_BASE = "https://melketun.com";

// فهرست (propertyCode, publicUrl) از DB — از پیش با پایتون آماده شده
const items: { code: string; url: string; branch: string }[] = JSON.parse(readFileSync(`${OUT_DIR}/web-urls.json`, "utf8"));

const done = new Set<string>();
if (existsSync(JSONL)) {
  for (const line of readFileSync(JSONL, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { done.add((JSON.parse(line) as { code: string }).code); } catch { /* ناقص */ }
  }
}
const queue = items.filter((it) => !done.has(it.code));
console.log(`[web] شروع: ${items.length} کل · انجام‌شده ${done.size} · باقی ${queue.length}`);

const status = {
  startedAt: new Date().toISOString(),
  total: items.length, doneAtStart: done.size,
  processed: 0, ok: 0, errors: 0,
  withFilerMobile: 0, lastCode: "", lastError: "", finished: false,
};
const writeStatus = () => writeFileSync(STATUS, JSON.stringify(status, null, 2));
writeStatus();

const T0 = Date.now();
let processedThisSession = 0;
for (let i = 0; i < queue.length; i++) {
  const it = queue[i];
  let rec: Record<string, unknown> | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(PUB_BASE + it.url, { redirect: "follow", signal: AbortSignal.timeout(20_000) });
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      // استخراج آبجکت owner از props (فرمت &quot; یا " بسته به مرحلهٔ رندر)
      const m = html.match(/&quot;owner&quot;:\{[^}]+\}/) ?? html.match(/"owner":\{[^}]+\}/);
      if (!m) throw new Error("no-owner");
      const raw = m[0].replace(/&quot;/g, '"');
      // جدا کردن بخش آبجکت از پیشوند "owner":
      const objStr = raw.slice(raw.indexOf("{"));
      const owner = JSON.parse(objStr) as { name?: string; mobile?: string };
      rec = {
        code: it.code,
        url: it.url,
        branch: it.branch,
        filerName: String(owner.name ?? "").trim(),
        filerMobile: String(owner.mobile ?? "").replace(/\D/g, ""),
      };
      break;
    } catch (e) {
      status.lastError = `${it.code}: ${String(e).slice(0, 60)}`;
      await sleep(attempt === 1 ? 2_000 : attempt === 2 ? 4_000 : 8_000);
    }
  }
  if (rec) {
    appendFileSync(JSONL, JSON.stringify(rec) + "\n");
    status.ok++;
    if ((rec.filerMobile as string)?.length >= 10) status.withFilerMobile++;
  } else {
    status.errors++;
  }
  status.processed = status.doneAtStart + status.ok + status.errors;
  status.lastCode = it.code;
  processedThisSession++;
  if (processedThisSession % 25 === 0) {
    const rate = processedThisSession / ((Date.now() - T0) / 1000);
    const eta = ((queue.length - i - 1) / Math.max(rate, 0.01)) / 60;
    console.log(`[web] ${status.processed}/${status.total} · ok=${status.ok} err=${status.errors} · ${rate.toFixed(2)}/s · ETA ${eta.toFixed(1)}min`);
    writeStatus();
  }
  await sleep(600);
}

status.finished = true;
writeStatus();
console.log(`[web] ✅ پایان — ok=${status.ok} err=${status.errors} · filerMobile=${status.withFilerMobile}`);
process.exit(0);
