#!/usr/bin/env bun
/** PN-026 · بُعد ۲ — ثبت حادثهٔ زندهٔ تعارض دو ناظر */
import { readFileSync, writeFileSync } from "node:fs";

const rh = JSON.parse(readFileSync("/home/z/my-project/download/pn026/runtime-health.json", "utf8"));

rh.liveIncident = {
  title: "تعارض دو ناظر سرور — حلقهٔ EADDRINUSE نگهبان",
  discoveredAt: "2026-10-09T22:10Z (کشف زندهٔ بُعد ۲)",
  timeline: [
    "19:17 — prod-watchdog (PID 1426) زنده شد (بازیابی پس از بازنشانی پلتفرم PN-025) و سرور خودش را اسپاون کرد",
    "20:23 — مراسم ری‌استارت قانون ۱۴ PN-025: سرور دستی با الگوی bash -c + tee (PID 23337→23339) بوت شد و پورت ۳۰۰۰ را گرفت",
    "20:24:58 — فرزند نگهبان جان باخت (کد ۱) — نگهبان بازسازی را آغاز کرد",
    "20:24:58 تا اکنون — هر ۵ ثانیه: اسپاون → EADDRINUSE (پورت در تصرف 23339) → کد ۱ — مجموع ۱۱۹۹ تلاش تا 22:10",
  ],
  currentState: {
    servingServer: "PID 23339 (bun server.js · از 20:23 · CPU 5.3% · MEM 15.4%) — سالم، همهٔ probeها پاسخ",
    watchdog: "PID 1426 (از 19:17 · CPU 0.0% · خواب بین بازسازی‌ها) — حلقهٔ بازسازی بی‌اثر",
    impactOnTraffic: "صفر — تمام probeهای بُعد ۲ سالم پاسخ دادند (صفر 5xx · صفر قطعی)",
    impactResources: "اندک و محدود — هر تلاش < ۱ ثانیه CPU · آلودگی لاگ ~۱٫۴KB/min (چرخش خودکار ۱۰MB هر ۳۰ دقیقه فعال)",
    "silver lining": "نگهبان عملاً به پشتیبان جانشین تبدیل شده — اگر 23339 بیفتد، ظرف ۵ ثانیه + گیت chunk جانشین می‌شود",
  },
  rootCause: "دو الگوی راه‌اندازی هم‌زمان: ری‌استارت دستیِ مراسم دروازه (bash -c | tee) و نگهبان طراحی‌شده (اسپاون مستقیم) — تعارض معماری، نه خطای کد",
  proposedFix: {
    phase: "۵ (رفع باگ — نیازمند مجوز صریح مالک)",
    optionA: "خاتمهٔ سرور دستی 23337/23339 → نگهبان ظرف ۵ ثانیه سرور تازه اسپاون می‌کند (مسیر طراحی‌شده) — هزینه: < ۱۰ ثانیه وقفه",
    optionB: "خاتمهٔ نگهبان (فلگ .prod-stop) — مسیر دستی می‌ماند — هزینه: از دست رفتن خود-بازسازی",
    recommendation: "A",
  },
  evidenceFiles: ["server.log", "server.log.20261009T205503Z.gz", "server.log.20261009T212508Z.gz", "server.log.20261009T215513Z.gz"],
};

rh.findings.push("کشف زندهٔ بُعد ۲: تعارض دو ناظر — ۱۱۹۹ تلاش EADDRINUSE از 20:24:58 — صفر تأثیر بر ترافیک (جزئیات: liveIncident)");

writeFileSync("/home/z/my-project/download/pn026/runtime-health.json", JSON.stringify(rh, null, 1));
console.log("✓ حادثهٔ زنده در runtime-health.json ثبت شد");
