// functional-check.ts — تست عملکردی ۰۳۴ (BLOCK 3.2): ۲۰/۲۰ رکورد (۵×۴ کاشی) + مغز + مهر
// اجرا: bun scripts/recovery-034/functional-check.ts [BASE]
export {}
const BASE = process.argv[2] ?? process.env.BASE ?? 'http://localhost:3000'

type R = { status: number; ms: number; body: any }
async function j(path: string, opts: RequestInit = {}): Promise<R> {
  const t0 = Date.now()
  try {
    const res = await fetch(BASE + path, opts)
    let body: any = null
    try { body = await res.json() } catch {}
    return { status: res.status, ms: Date.now() - t0, body }
  } catch (e: any) {
    return { status: 0, ms: Date.now() - t0, body: { error: String(e?.message || e) } }
  }
}

let pass = 0
let fail = 0
const ok = (cond: boolean, label: string, extra = '') => {
  if (cond) {
    pass++
    console.log(`  PASS ${label}${extra ? ' — ' + extra : ''}`)
  } else {
    fail++
    console.log(`  FAIL ${label}${extra ? ' — ' + extra : ''}`)
  }
}
const rowsOf = (b: any): any[] => {
  if (!b || typeof b !== 'object') return []
  if (Array.isArray(b)) return b
  for (const k of ['rows', 'items', 'records', 'data']) {
    const v = (b as any)[k]
    if (Array.isArray(v)) return v
    if (v && typeof v === 'object' && Array.isArray((v as any).rows)) return (v as any).rows
  }
  return []
}
const nonNull = (o: any) =>
  Object.values(o || {}).filter((v) => v !== null && v !== undefined && v !== '').length

console.log(`# تست عملکردی ۰۳۴ — ${new Date().toISOString()} — BASE=${BASE}`)

// ═══ مهر نسخه ═══
const ver = await j('/api/version')
ok(ver.status === 200 && !!ver.body?.gitSha, 'مهر نسخهٔ زنده', JSON.stringify(ver.body))

// ═══ ورود مدیر (کدمستر 00000000 — گام صفر P6547) ═══
const login = await j('/api/auth/master-login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ masterCode: '00000000' }),
})
ok(login.status === 200 && !!login.body?.token, 'ورود مدیر با کدمستر 00000000', `user=${login.body?.user?.displayName ?? '-'} (${login.ms}ms)`)
const H: Record<string, string> = { authorization: `Bearer ${login.body?.token ?? ''}` }

const oldL = await j('/api/auth/master-login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ masterCode: '11111111' }),
})
ok(oldL.status === 401, 'رد کد قدیمی 11111111', `status=${oldL.status}`)

// ═══ M1 — آگهی ملک تبریز (۵ رکورد) ═══
console.log('── M1 آگهی ملک تبریز ──')
const m1 = await j('/api/crm/arm-catalog/listings?limit=5', { headers: H })
const m1rows = rowsOf(m1.body)
ok(m1.status === 200, 'M1 روت فهرست 200', `${m1.ms}ms`)
ok(m1rows.length >= 5, 'M1 پنج رکورد باز شد', `rows=${m1rows.length} total=${m1.body?.total ?? m1.body?.count ?? '?'}`)
for (const r of m1rows.slice(0, 5))
  console.log(`    • ${r.propertyCode ?? r.code ?? r.id ?? '?'} | ${r.ownerName ?? r.rawOwnerName ?? '-'} | ${r.areaName ?? '-'} | ${r.tradeTypeName ?? '-'}`)
ok(m1rows.slice(0, 5).every((r: any) => nonNull(r) >= 3), 'M1 دادهٔ سالم رکوردها (فیلدهای پرشده)')

// ═══ M2 — درخواست ملک تبریز (۵ رکورد) ═══
console.log('── M2 درخواست ملک تبریز ──')
const m2 = await j('/api/crm/arm-catalog/requests?limit=5', { headers: H })
const m2rows = rowsOf(m2.body)
ok(m2.status === 200, 'M2 روت فهرست 200', `${m2.ms}ms`)
ok(m2rows.length >= 5, 'M2 پنج رکورد باز شد', `rows=${m2rows.length} total=${m2.body?.total ?? m2.body?.count ?? '?'}`)
for (const r of m2rows.slice(0, 5))
  console.log(`    • ${r.code ?? r.requestCode ?? r.id ?? '?'} | ${r.realtorName ?? r.consultantName ?? '-'} | ${JSON.stringify(r.areaNames ?? r.areas ?? '-').slice(0, 40)}`)
ok(m2rows.slice(0, 5).every((r: any) => nonNull(r) >= 3), 'M2 دادهٔ سالم رکوردها')

// ═══ M3 — معاملات (۵ رکورد + حق‌السهم/شعبه) ═══
console.log('── M3 معاملات و قراردادها ──')
const m3 = await j('/api/crm/transactions?limit=5', { headers: H })
const m3rows = rowsOf(m3.body)
ok(m3.status === 200, 'M3 روت فهرست 200', `${m3.ms}ms`)
ok(m3rows.length >= 5, 'M3 پنج رکورد باز شد', `rows=${m3rows.length} total=${m3.body?.total ?? m3.body?.count ?? '?'}`)
for (const r of m3rows.slice(0, 5))
  console.log(`    • ${r.code ?? r.id ?? '?'} | ${r.sellerName ?? r.ownerName ?? '-'} → ${r.buyerName ?? '-'} | ${r.consultantName ?? r.expertName ?? '-'} | شعبه=${r.branchTitle ?? r.branchName ?? '-'}`)
ok(m3rows.slice(0, 5).every((r: any) => nonNull(r) >= 3), 'M3 دادهٔ سالم رکوردها')

// ═══ M4 — کارشناسان (۵ رکورد + شعبه/تاریخ/نوع همکاری) ═══
console.log('── M4 کارشناسان و کارکنان ──')
const m4 = await j('/api/crm/experts?limit=5', { headers: H })
const m4rows = rowsOf(m4.body)
ok(m4.status === 200, 'M4 روت فهرست 200', `${m4.ms}ms`)
ok(m4rows.length >= 5, 'M4 پنج رکورد باز شد', `rows=${m4rows.length} total=${m4.body?.total ?? m4.body?.count ?? '?'}`)
for (const r of m4rows.slice(0, 5))
  console.log(`    • ${r.fullName ?? r.name ?? '-'} | شعبه=${r.branchTitle ?? '-'} | همکاری=${r.employmentType ?? '-'} | استخدام=${r.hireDate ?? '-'}`)
ok(m4rows.slice(0, 5).every((r: any) => nonNull(r) >= 3), 'M4 دادهٔ سالم رکوردها')

// ═══ پوشش ستون‌ها + کارت مغز + اتصال‌ها ═══
console.log('── پوشش / مغز / اتصال‌ها ──')
const cov = await j('/api/coverage', { headers: H })
ok(cov.status === 200, 'روت پوشش ستون‌ها 200', `${cov.ms}ms`)
console.log('    پوشش:', JSON.stringify(cov.body).slice(0, 220))

const brain = await j('/api/intelligence/status', { headers: H })
ok(brain.status === 200 && !!brain.body, 'کارت مغز (intelligence/status) 200', `${brain.ms}ms`)
console.log('    مغز:', JSON.stringify(brain.body).slice(0, 340))

const conn = await j('/api/connection/status', { headers: H })
ok(conn.status === 200, 'وضعیت اتصال‌ها 200', `${conn.ms}ms`)

console.log(`\n═══ نتیجهٔ نهایی: ${pass} PASS / ${fail} FAIL ═══`)
process.exit(fail ? 1 : 0)
