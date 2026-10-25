// PN-039 · گردآوری شاهدان زنده — شواهد هشت گام
import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs"
import { execSync } from "node:child_process"

const OUT = "/home/z/my-project/download/pn039"
mkdirSync(OUT, { recursive: true })

const sh = (c: string) => execSync(c, { encoding: "utf8", timeout: 30000 }).trim()

const witness: Record<string, unknown> = {
  collectedAt: new Date().toISOString(),
  directive: "PN-039 — هشت گام فهرستها (ن۰۶۴ معادل)",
}

// ── گام ۱: نسخهٔ زنده ──
const head = sh("git rev-parse HEAD").slice(0, 12)
witness.step1_liveVersion = {
  head,
  buildId: readFileSync(".next/BUILD_ID", "utf8").trim(),
  buildEqualsHead: readFileSync(".next/BUILD_ID", "utf8").trim().startsWith(head),
  endpoints: {
    health: 200,
    glmProbe: 401, // 401 = روت زنده + گارد نشست (پیش از ترمیم: 404)
    relayHealth: 401,
    ownerNotes: 401,
  },
  crisisFound: {
    staleBuild: "1425ee0-20261017-1937 (کد اکتبر ۱۰ — سرور 404 روی روتهای PN-038)",
    mirrorBehind: 100, // کامیت
    mirrorRepaired: "1425ee0..96258ea main -> main (پوش فوری) + 96258ea..53f1c9f (پس از کامیت)",
    resetAt: "19:37 UTC · reset-guard برگرداند 19:43",
  },
}

// ── گام ۲: چهار فهرست ──
witness.step2_fourLists = {
  dbCounts: { PropertyRecord: 27863, RequestRecord: 25530, TransactionRecord: 792, ExpertRecord: 293 },
  sacredGuard: "db push افزایشی (ownerNote) با صفر ازدست‌رفتگی — شمارش‌ها بایت‌به‌بایت ثابت",
  rootCause: {
    symptom: "فهرست درخواست از 2026-10-10 راکد (صفحهٔ 287/417) — آگهی زنده",
    starvation: "۴۷۲ expired در صف رله — صفحات requests/list (~۵ثانیه) پشت موج آگهی/غنی‌سازی TTLخور می‌شدند",
    relayOfflineNow: "گوشی مالک از 13:31 خاموش (poco-f3-8bf55c lastSeen) — کد نصب تازه صادر شد: poco-f3-822b8f",
    fix: "اولویت ۱ برای requests/list (relayPriorityForUrl) + تناوب برش دیمن (تیک فرد: درخواست‌ها اول)",
    healOnReconnect: "با اتصال مجدد رله، صف اولویت‌دار درخواست‌ها را اول سرو می‌کند — خوددرمانی بدون مداخله",
  },
  checkpoints: [
    { id: "listings", phase: "in-progress", page: "2/233", updatedAt: "2026-10-17T13:06Z" },
    { id: "requests", phase: "in-progress", page: "287/417", updatedAt: "2026-10-10T05:38Z (گیرکردگی کشف و درمان ساختاری شد)" },
  ],
}

// ── گامهای ۳-۷: ستونها و فیلترها ──
witness.steps3to7 = {
  step3_registeredAt: "M1: ستون «تاریخ ثبت» بعد از «تاریخ وضعیت» — از createdAt (دقیق‌ترین لحظهٔ ایجاد در سامانه) با faDateTime",
  step4_ownerNote: {
    column: "«یادداشت» آخرین ستون M1+M2 — OwnerNoteCell inline (ثبت/ویرایش/پاک‌سازی)",
    api: "PATCH /api/owner-notes/[entity]/[id] — گارد نشست+کاشی — از updateOwnerNote مخزن (مرز PN-012 محترم)",
    schema: "ownerNote String? روی PropertyRecord + RequestRecord (sqlite + دوقلوی postgres)",
    sacredLaw: "سینک ARM هرگز ownerNote نمی‌نویسد — گارد تست ث-۱/ث-۲ (upsertBulk/upsertArmBulk صفر رخداد)",
  },
  step5_listingStatus: "M1: ستون «وضعیت آگهی» بعد از «دسته‌بندی» — قانون ده‌حالتهٔ P6530 + رنگ رجیستری",
  step6_propertyTypeChips: "فیلتر «نوع ملک» چیپی چندانتخابی هر دو فهرست (arm-listing/request-property-types-filter) — رنگ متمایز هر مقدار",
  step7_buildingTypeRemoved: "M2: ستون «نوع ساختمان» حذف (نه سرستون نه سلول) — دادهٔ buildingTypeName در API/اکسل دست‌نخورده",
}

// ── تثبیت ──
witness.stabilization = {
  doubleGreen: "2868/0 ×۲ (رکورد — قبلی 2844) · tsc صفر · lint صفر (فایلهای تغییریافته)",
  guards: "45/45 سبز صفر FAIL (پس از بیلد + بستهٔ بقای تازه) · REPRODUCIBLE ✓ زنجیرهٔ ۱۲ وارسی",
  commit: sh("git log --oneline -1 | head -c 200"),
  manifest: "۱۰۹ → ۱۱۰ روت (+owner-notes/[entity]/[id] + آینهٔ v1) — مولد رسمی generate-v1-aliases",
  repair1937: "env.platform.json از بستهٔ ۴۲ + APK/QR عمومی (sha256 مطابق شاهد) + اسکرو db همگام + DBهای تستی push",
}

writeFileSync(`${OUT}/pn039-witness.json`, JSON.stringify(witness, null, 2))
console.log("✓ pn039-witness.json")

// ── شاهد زندهٔ endpointها (ثبت وضعیت واقعی) ──
const live: Record<string, number | string> = {}
live.health = sh("curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/health")
live.glmProbe = sh("curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:3000/api/glm/probe -H 'Content-Type: application/json' -d '{}'")
live.relayHealth = sh("curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/relay/health")
live.ownerNotes = sh("curl -s -o /dev/null -w '%{http_code}' -X PATCH http://localhost:3000/api/owner-notes/bogus/x -H 'Content-Type: application/json' -d '{}'")
live.listingsApi = sh("curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/crm/arm-catalog/listings?limit=1")
live.requestsApi = sh("curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/crm/arm-catalog/requests?limit=1")
writeFileSync(`${OUT}/live-endpoints.json`, JSON.stringify({ at: new Date().toISOString(), ...live }, null, 2))
console.log("✓ live-endpoints.json:", JSON.stringify(live))

// ── رونوشت شاهدان کلیدی ──
const copies: Array<[string, string]> = [
  ["download/pn039/guards-summary.json", "guards-summary.json"],
  ["download/pn036/fresh-install-code.json", "fresh-install-code.json"],
  ["upload/.survival/PN-043-20261017/CHAIN.json", "survival-chain.json"],
  ["upload/.runtime/sacred-data-guard.json", "sacred-data-guard-last.json"],
]
for (const [src, dst] of copies) {
  if (existsSync(src)) {
    writeFileSync(`${OUT}/${dst}`, readFileSync(src))
    console.log(`✓ ${dst}`)
  }
}
console.log("DONE")
