#!/bin/bash
# تأیید E2E فیلتر مکان — ورود مالک، مهاجرت ۱۷ منطقه، فیلتر خواندن، اعتبارسنجی
set -e
BASE=http://localhost:3000

echo "=== ۱) ورود مالک ==="
TOKEN=$(curl -s -X POST $BASE/api/auth/master-login -H "content-type: application/json" -d '{"masterCode":"41372895"}' | bun -e 'const r=await Bun.stdin.json(); process.stdout.write(r.token ?? "")')
echo "token: ${TOKEN:0:24}..."

echo ""
echo "=== ۲) GET settings — آیا مهاجرت ۱۷ منطقه فعال شد؟ ==="
curl -s -H "authorization: Bearer $TOKEN" $BASE/api/divar/settings | bun -e '
const r = await Bun.stdin.json();
const s = r.settings;
console.log("areaIds:", s.areaIds.length, "| lineIds:", s.lineIds.length);
console.log("فیلتر مکان:", s.areaIds.length > 0 ? `فعال (${s.areaIds.length} منطقه)` : "خاموش");
console.log("locationDefaults از meta:", r.meta.locationDefaults.areaIds.length, "منطقه");
'

echo ""
echo "=== ۳) GET locations — رجیستری کامل ==="
curl -s -H "authorization: Bearer $TOKEN" $BASE/api/divar/locations | bun -e '
const r = await Bun.stdin.json();
console.log("totalAreas:", r.totalAreas, "| totalLines:", r.totalLines, "| areas در پاسخ:", r.areas.length);
const names = ["ولیعصر","ولیعصر جنوبی","استانداری","سپهر صادرات","میرداماد","زعفرانیه","الهی پرست","رجایی شهر","ویلاشهر","دادگستری (ایل گلی)","سهند (ایل گلی)","فردوس","باغچه بان","یاغچیان","35 متری سینا","گلشهر","پرواز"];
const found = r.areas.filter(a => names.includes(a.name));
console.log("۱۷ منطقه پیش‌فرض در رجیستری:", found.length, "/ 17");
console.log("نمونه:", found.slice(0,5).map(a=>`${a.name}(${a.lines.length} محله)`).join("، "));
'

echo ""
echo "=== ۴) PUT settings با شناسه نامعتبر → باید رد شود ==="
curl -s -H "authorization: Bearer $TOKEN" -X PUT $BASE/api/divar/settings -H "content-type: application/json" -d '{"areaIds":["fake-id-123"]}' | head -c 220; echo

echo ""
echo "=== ۵) GET ads — فیلتر خواندن روی آگهی‌های موجود ==="
curl -s -H "authorization: Bearer $TOKEN" "$BASE/api/divar/ads?bucket=all&limit=100" | bun -e '
const r = await Bun.stdin.json();
console.log("locationFilter:", JSON.stringify(r.locationFilter));
console.log("rows:", r.rows.length, "| bucketCounts:", JSON.stringify(r.bucketCounts));
const ALLOWED = ["ولیعصر","ولیعصر جنوبی","استانداری","سپهر صادرات","میرداماد","زعفرانیه","الهی پرست","رجایی شهر","ویلاشهر","دادگستری (ایل گلی)","سهند (ایل گلی)","فردوس","باغچه بان","یاغچیان","35 متری سینا","گلشهر","پرواز"];
const areas = [...new Set(r.rows.map(x=>x.matchedAreaName).filter(Boolean))];
console.log("مناطق آگهی‌های نمایش‌داده‌شده:", areas.join("، ") || "(خالی)");
const out = r.rows.filter(x => x.matchedAreaName && !ALLOWED.includes(x.matchedAreaName));
console.log("آگهی خارج از ۱۷ منطقه در فهرست:", out.length, "(باید ۰ باشد)");
'

echo ""
echo "=== ۶) PUT settings: انتخاب فقط «ولیعصر و پرواز» و بازگشت به ۱۷ ==="
VALI=$(curl -s -H "authorization: Bearer $TOKEN" $BASE/api/divar/locations | bun -e '
const r=await Bun.stdin.json();
const ids=r.areas.filter(a=>["ولیعصر","پرواز"].includes(a.name)).map(a=>a.id);
process.stdout.write(JSON.stringify({areaIds:ids,lineIds:[]}));
')
curl -s -H "authorization: Bearer $TOKEN" -X PUT $BASE/api/divar/settings -H "content-type: application/json" -d "$VALI" | bun -e '
const r=await Bun.stdin.json();
console.log("ذخیره دو منطقه:", r.ok ? "OK" : "FAIL", "| areaIds:", r.settings.areaIds.length);
'
curl -s -H "authorization: Bearer $TOKEN" "$BASE/api/divar/ads?bucket=all&limit=100" | bun -e '
const r=await Bun.stdin.json();
console.log("پس از انتخاب دو منطقه — rows:", r.rows.length, "| bucketCounts:", JSON.stringify(r.bucketCounts));
console.log("locationFilter:", JSON.stringify(r.locationFilter));
'
# بازگشت به ۱۷ منطقه پیش‌فرض
DEF=$(curl -s -H "authorization: Bearer $TOKEN" $BASE/api/divar/settings | bun -e '
const r=await Bun.stdin.json();
process.stdout.write(JSON.stringify({areaIds:r.meta.locationDefaults.areaIds,lineIds:[]}));
')
curl -s -H "authorization: Bearer $TOKEN" -X PUT $BASE/api/divar/settings -H "content-type: application/json" -d "$DEF" | bun -e '
const r=await Bun.stdin.json();
console.log("بازگشت به پیش‌فرض:", r.ok ? "OK" : "FAIL", "| areaIds:", r.settings.areaIds.length, "منطقه");
'
