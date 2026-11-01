/**
 * تشخیص کاشی فایل‌یابی — آزمون زندهٔ قیف اسکن دیوار بر آگهی‌های واقعی امروز
 * پاسخ به: «مکانیسم فایل یابی از دیوار اصلاح شود و میزان فایل های شخصی بیشتری استخراج گردد»
 */
import { webSearchTabriz, webGetPostDetail, type DivarPostDetail } from "@/lib/divar/client";
import { loadDivarSettings } from "@/lib/divar/store";
import { timeWindowHours } from "@/lib/divar/config";
import { matchTabrizLocation, locationAllowed, scoreLocation } from "@/lib/divar/scoring-locations-shim";
import { parseDivarJalaliDateTime } from "@/lib/divar/parse";

async function main() {
  const settings = await loadDivarSettings();
  const hours = timeWindowHours(settings.timeWindow);
  const windowStart = new Date(Date.now() - hours * 3600 * 1000);
  console.log(`پنجره: ${settings.timeWindow} (${hours}h) · دسته‌ها: ${settings.categories.length} · مناطق انتخابی: ${settings.areaIds.length}`);

  // مرحله ۱ — جست‌وجو (فقط ۲ دسته برای تشخیص)
  const probeCategories = ["apartment-sell", "house-villa-sell"];
  let tokens: { token: string; title: string; category: string; bottomText: string | null; priceText: string | null }[] = [];
  for (const category of probeCategories) {
    let searchUid: string | null = null, viewedTokens: string | null = null, lastPostDate: string | null = null;
    for (let page = 1; page <= 3; page++) {
      const res = await webSearchTabriz({ category, page, searchUid, viewedTokens, lastPostDate });
      for (const r of res.rows) tokens.push({ token: r.token, title: r.title, category, bottomText: r.bottomText, priceText: r.priceText });
      searchUid = res.searchUid; viewedTokens = res.viewedTokens; lastPostDate = res.lastPostDate;
      if (!res.hasMore) break;
    }
  }
  console.log(`\n[جست‌وجو] ${tokens.length} آگهی از ${probeCategories.length} دسته`);

  // مرحله ۲ — جزئیات ۲۵ آگهی نمونه و تشخیص نقطهٔ ریزش
  const sample = tokens.slice(0, 25);
  let fetched = 0, inWindow = 0, noLocationSignal = 0, textLoc = 0, coordLoc = 0, allowed = 0, personal = 0;
  const dropReasons: Record<string, number> = {};
  const examples: string[] = [];

  for (const t of sample) {
    const detail: DivarPostDetail | null = await webGetPostDetail(t.token).catch(() => null);
    if (!detail) { dropReasons["detail-fetch-failed"] = (dropReasons["detail-fetch-failed"] ?? 0) + 1; continue; }
    fetched += 1;

    const publishedAt = parseDivarJalaliDateTime(detail.publishedText);
    if (!publishedAt || publishedAt < windowStart) { dropReasons["out-of-time-window"] = (dropReasons["out-of-time-window"] ?? 0) + 1; continue; }
    inWindow += 1;

    // سیگنال‌های مکانی
    const hasText = Boolean(detail.locationText && detail.locationText.trim());
    const hasCoords = detail.latitude != null && detail.longitude != null;
    const match = matchTabrizLocation({
      title: detail.title, locationText: detail.locationText, description: detail.description,
      latitude: detail.latitude, longitude: detail.longitude,
    });
    if (match.lineId) { if (hasCoords) coordLoc += 1; if (hasText) textLoc += 1; }
    else if (!hasText && !hasCoords) noLocationSignal += 1;

    const allowedB = locationAllowed({ areaId: match.areaId, lineId: match.lineId }, settings);
    if (!allowedB) {
      dropReasons["out-of-area (locationAllowed=false)"] = (dropReasons["out-of-area (locationAllowed=false)"] ?? 0) + 1;
      if (examples.length < 8) {
        examples.push(`  رد: «${detail.title.slice(0, 40)}» · loc=${detail.locationText ?? "NULL"} · coords=${detail.latitude != null ? "✓" : "✗"} · matchedLine=${match.lineId ?? "null"} · reason=${match.reason.slice(0, 60)}`);
      }
      continue;
    }
    allowed += 1;

    // شخصی؟
    const publisher = detail.publisherType ?? "(نامشخص)";
    if (detail.publisherType && detail.publisherType !== "personal") continue;
    personal += 1;
    void publisher;
  }

  console.log(`[جزئیات] fetched=${fetched}/${sample.length} · درون پنجره=${inWindow}`);
  console.log(`[مکان] بدون هیچ سیگنال مکانی=${noLocationSignal} · تطبیق متنی موفق=${textLoc} · تطبیق مختصات موفق=${coordLoc}`);
  console.log(`[قیرو نهایی] مجاز مکانی=${allowed} · بالقوه شخصی=${personal}`);
  console.log("\n[دلایل ریزش]:", JSON.stringify(dropReasons, null, 1));
  console.log("\n[نمونه‌های ردشده]:");
  for (const e of examples) console.log(e);
}

main().catch((e) => { console.error("CRASH:", e); process.exit(1); });
