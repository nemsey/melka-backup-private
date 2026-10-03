/**
 * P6546/BLOCK 0 — کشف API دو سامانهٔ جدید ملک تبریز
 * ۱) gap.melketabriz.ir  (سامانه مدیریت چت)
 * ۲) melketabriz.com     (سامانه عمومی / سایت عمومی ملک تبریز)
 * خروجی: download/p6546/systems-discovery.json
 */
import { writeFileSync, mkdirSync } from "node:fs";

const UA = "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Mobile Safari/537.36";
const OUT: any = { probeAt: new Date().toISOString(), gap: {}, melkPublic: {} };

async function probe(url: string, init?: RequestInit, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      cache: "no-store",
      headers: { "User-Agent": UA, Accept: "*/*", ...(init?.headers ?? {}) },
      ...init,
    });
    const ct = res.headers.get("content-type") ?? "";
    const body = await res.text();
    return {
      url,
      httpStatus: res.status,
      contentType: ct,
      latencyMs: Date.now() - started,
      bodyHead: body.slice(0, 900),
      bodyLength: body.length,
    };
  } catch (e: any) {
    return { url, error: String(e?.message ?? e), latencyMs: Date.now() - started };
  } finally {
    clearTimeout(t);
  }
}

function extractScripts(html: string): string[] {
  const out: string[] = [];
  const re = /<script[^>]+src=["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}

(async () => {
  // ================= GAP =================
  OUT.gap.root = await probe("https://gap.melketabriz.ir");
  const gapScripts = OUT.gap.root.bodyHead ? extractScripts(OUT.gap.root.bodyHead) : [];
  OUT.gap.scripts = gapScripts;
  // پروب مسیرهای رایج NestJS/SPA
  for (const p of ["/api", "/api/", "/api/public/portalInfo", "/swagger", "/api/docs", "/favicon.ico"]) {
    OUT.gap["probe:" + p] = await probe("https://gap.melketabriz.ir" + p);
  }
  // اگر SPA است، باندل اصلی را برای کشف مسیرها بکشیم
  const mainJs = gapScripts.find((s) => /main|app|index|chunk/i.test(s));
  if (mainJs) {
    const jsUrl = mainJs.startsWith("http") ? mainJs : "https://gap.melketabriz.ir" + (mainJs.startsWith("/") ? "" : "/") + mainJs;
    const js = await probe(jsUrl, undefined, 25000);
    OUT.gap.mainBundle = { url: jsUrl, httpStatus: js.httpStatus, bodyLength: js.bodyLength };
    if (js.bodyHead) {
      // کشف الگوهای API از باندل
      const apiPaths = new Set<string>();
      const re = /["'`](\/?api\/[a-zA-Z0-9_\-\/{}\.]{2,80})["'`]/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(js.bodyHead))) apiPaths.add(m[1]);
      OUT.gap.apiPathsFromBundle = [...apiPaths].slice(0, 80);
      const authRe = /["'`](authentication[a-zA-Z0-9_\-\/{}\.]{0,60})["'`]/g;
      const authPaths = new Set<string>();
      while ((m = authRe.exec(js.bodyHead))) authPaths.add(m[1]);
      OUT.gap.authPathsFromBundle = [...authPaths].slice(0, 30);
    }
  }

  // ================= MELK PUBLIC (melketabriz.com) =================
  OUT.melkPublic.root = await probe("https://melketabriz.com");
  const mpScripts = OUT.melkPublic.root.bodyHead ? extractScripts(OUT.melkPublic.root.bodyHead) : [];
  OUT.melkPublic.scripts = mpScripts.slice(0, 20);
  // پروب‌های رایج وردپرس/REST
  for (const p of [
    "/wp-json/wp/v2/posts?per_page=5",
    "/wp-json/wp/v2/pages?per_page=3",
    "/wp-json/wp/v2/categories?per_page=20",
    "/wp-json",
    "/api",
    "/api/posts",
    "/sitemap.xml",
    "/feed",
  ]) {
    OUT.melkPublic["probe:" + p] = await probe("https://melketabriz.com" + p);
  }

  mkdirSync("/home/z/my-project/download/p6546", { recursive: true });
  writeFileSync("/home/z/my-project/download/p6546/systems-discovery.json", JSON.stringify(OUT, null, 2));
  // خلاصهٔ کنسولی
  console.log("=== GAP ===");
  console.log("root:", OUT.gap.root.httpStatus ?? OUT.gap.root.error, OUT.gap.root.contentType);
  console.log("scripts:", gapScripts.slice(0, 8));
  console.log("apiPaths:", OUT.gap.apiPathsFromBundle?.slice(0, 25));
  console.log("authPaths:", OUT.gap.authPathsFromBundle?.slice(0, 10));
  console.log("=== MELK PUBLIC ===");
  console.log("root:", OUT.melkPublic.root.httpStatus ?? OUT.melkPublic.root.error, OUT.melkPublic.root.contentType);
  console.log("head:", (OUT.melkPublic.root.bodyHead ?? "").slice(0, 400).replace(/\n/g, " "));
  for (const k of Object.keys(OUT.melkPublic)) {
    if (k.startsWith("probe:")) {
      const v = OUT.melkPublic[k];
      console.log(k, "→", v.httpStatus ?? v.error, (v.contentType ?? "").slice(0, 40), (v.bodyHead ?? "").slice(0, 120).replace(/\n/g, " "));
    }
  }
})();
