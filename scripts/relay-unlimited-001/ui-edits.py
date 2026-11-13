#!/usr/bin/env python3
"""DIR-RELAY-UNLIMITED-001 — UI edits for RelaySetupSection.tsx (bidi-safe)."""

P = "src/core/tiles/tiles/settings/RelaySetupSection.tsx"
s = open(P, encoding="utf-8").read()
orig = s

# 1) Header doc comment — append N-generation note before the closing of the header
old_header_anchor = "درس ماندگار جلسهٔ ۰۵۴:"
new_header = (
    " * DIR-RELAY-UNLIMITED-001 (دستور مالک ۲۰۲۶-۱۱-۱۴ · «بدون محدودیت زمانی/حجمی»):\n"
    " *   · اعتبار کد نصب ۳۰ دقیقه ← ۳۰ روز (RELAY_ENROLL_TTL_HOURS) و تا ۹۹ دانلود —\n"
    " *     شمارش معکوس چندروزه (روز/ساعت زیر ۱ روز، MM:SS زیر ۱ ساعت).\n"
    " *   · نشان‌های حمل‌ونقل نسل N: batch=۴۸ · استخر ۱۶+۸ کارگر · سقف نرخ ۲۰/دقیقه ·\n"
    " *     نتیجهٔ جریانی موج‌به‌موج · بدون محدودیت حجم (تا ۱۶MB هر نتیجه).\n"
    " *\n"
)
assert old_header_anchor in s, "header anchor missing"
s = s.replace(old_header_anchor, new_header + " * " + old_header_anchor, 1)

# 2) Countdown computation — multi-day aware
old_count = """  const enrollExpiresMs = enroll ? new Date(enroll.enrollExpires).getTime() : 0;
  const secondsLeft = enroll ? Math.max(0, Math.floor((enrollExpiresMs - nowMs) / 1000)) : 0;
  const enrollActive = !!enroll && secondsLeft > 0;
  const countdownMm = faDigits(String(Math.floor(secondsLeft / 60)).padStart(2, "0"));
  const countdownSs = faDigits(String(secondsLeft % 60).padStart(2, "0"));"""
new_count = """  const enrollExpiresMs = enroll ? new Date(enroll.enrollExpires).getTime() : 0;
  const secondsLeft = enroll ? Math.max(0, Math.floor((enrollExpiresMs - nowMs) / 1000)) : 0;
  const enrollActive = !!enroll && secondsLeft > 0;
  const daysLeft = Math.floor(secondsLeft / 86400);
  const hoursLeft = Math.floor((secondsLeft % 86400) / 3600);
  const countdownMm = faDigits(String(Math.floor(secondsLeft / 60)).padStart(2, "0"));
  const countdownSs = faDigits(String(secondsLeft % 60).padStart(2, "0"));
  // DIR-RELAY-UNLIMITED-001: چندروزه — «X روز و Y ساعت»؛ زیر ۱ روز فقط ساعت؛ زیر ۱ ساعت MM:SS
  const countdownLabel =
    secondsLeft >= 86400
      ? `${faNumber(daysLeft)} روز و ${faNumber(hoursLeft)} ساعت`
      : secondsLeft >= 3600
        ? `${faNumber(hoursLeft)} ساعت`
        : `${countdownMm}:${countdownSs}`;"""
assert old_count in s, "countdown block missing"
s = s.replace(old_count, new_count, 1)

# 3) Transport badges
old_badges_start = s.find("aria-label=\"پیکربندی حمل‌ونقل رله\"")
assert old_badges_start > 0, "badges anchor missing"
old_badges_end = s.find("</div>", old_badges_start)
new_badges = """aria-label=\"پیکربندی حمل‌ونقل رله\">
        <Badge variant=\"outline\" className=\"gap-1 text-[10px] font-normal\">
          <Timer className=\"w-3 h-3\" aria-hidden /> Poll طولانی: ۵۰ ثانیه
        </Badge>
        <Badge variant=\"outline\" className=\"gap-1 text-[10px] font-normal\">
          دسته: ۴۸ آیتم · استخر ۱۶+۸ کارگر موازی
        </Badge>
        <Badge variant=\"outline\" className=\"gap-1 text-[10px] font-normal\">
          نتیجهٔ جریانی موج‌به‌موج (poll میان‌موجی ۵ث)
        </Badge>
        <Badge variant=\"outline\" className=\"gap-1 text-[10px] font-normal\">
          بدون محدودیت حجم/تعداد (تا ۱۶MB هر نتیجه)
        </Badge>
      """
s = s[:old_badges_start] + new_badges + s[old_badges_end:]

# 4) Expired-code message + hint text
old_exp = "⏰ کد نصب قبلی منقضی شد (پنجرهٔ ۳۰ دقیقه‌ای بسته شد) — دکمهٔ زیر کد تازه صادر می‌کند."
new_exp = "⏰ کد نصب قبلی منقضی شد (پنجرهٔ اعتبار ۳۰ روزه بسته شد) — دکمهٔ زیر کد تازه صادر می‌کند."
assert old_exp in s, "expired msg missing"
s = s.replace(old_exp, new_exp, 1)

old_hint = "مسیر سه‌گامی پیش‌روی شما (همان مسیر موفق PN-031-I)."
new_hint = "مسیر سه‌گامی پیش‌روی شما (همان مسیر موفق PN-031-I). کد تا ۳۰ روز و ۹۹ بار دانلود معتبر است."
assert old_hint in s, "hint missing"
s = s.replace(old_hint, new_hint, 1)

# 5) Countdown badge render — label + thresholds
old_badge = 'variant={secondsLeft > 300 ? "default" : secondsLeft > 60 ? "outline" : "destructive"}'
new_badge = 'variant={secondsLeft > 3600 ? "default" : secondsLeft > 300 ? "outline" : "destructive"}'
assert old_badge in s, "badge variant missing"
s = s.replace(old_badge, new_badge, 1)

old_label = "انقضای کد نصب: {countdownMm}:{countdownSs}"
new_label = "انقضای کد نصب: {countdownLabel}"
assert old_label in s, "badge label missing"
s = s.replace(old_label, new_label, 1)

# 6) maxAttempts default 3 -> 99
old_att = "faNumber(enroll.maxAttempts ?? 3)"
new_att = "faNumber(enroll.maxAttempts ?? 99)"
assert old_att in s, "maxAttempts default missing"
s = s.replace(old_att, new_att, 1)

# 7) wording for 99 downloads
old_use = "} بار</b> قابل استفاده (کد بخشنده). اگر تلاش اول خطا داد،"
new_use = "} بار</b> دانلود (کد بخشنده). اگر تلاش اول خطا داد،"
assert old_use in s, "use wording missing"
s = s.replace(old_use, new_use, 1)

assert s != orig
open(P, "w", encoding="utf-8").write(s)
print("UI edits applied: 7 blocks")
