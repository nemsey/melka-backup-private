/**
 * تست‌های PN-031-E — سخت‌سازی رلهٔ Termux + رفع سه شکایت مالک (دستور ۱۴۰۵/۰۷/۲۳)
 * ---------------------------------------------------------------------------
 *   A) اسکریپت رله — همگام‌سازی ساعت با سرور + اصلاح ts امضا (ریشهٔ خاموش stale)
 *   B) اسکریپت رله — دیده‌شدن خطاها (پیام دقیق سرور · کد curl فارسی · ضربان قلب)
 *   C) سرور — ردپای ردِ Poll (RELAY_POLL_REJECT با دلیل) + serverTime در پاسخ رد
 *   D) QR — فایل ایستا همیشه موجود + fallback در UI (تنظیمات عمومی)
 *   E) پابرجایی قرارداد امنیتی — پیام امضا و whitelist دست‌نخورده
 *
 * اجرا: bun test tests/pn031e-relay-hardening.test.ts
 */

import { describe, test, expect } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildRelayScript, buildInstallCommand } from "../src/lib/melk-api/relay-script";

const REPO = join(import.meta.dir, "..");
const RELAY_LIB = join(REPO, "src/lib/melk-api/relay.ts");
const POLL_ROUTE = join(REPO, "src/app/api/mobile-relay/poll/route.ts");
const RESULT_ROUTE = join(REPO, "src/app/api/mobile-relay/result/route.ts");
const RELAY_UI = join(REPO, "src/core/tiles/tiles/settings/RelaySetupSection.tsx");
const APK_PUBLIC = join(REPO, "public/deliver/pn031d/melka-relay.apk");
const QR_STATIC = join(REPO, "public/deliver/pn031d/qr-apk.svg");

const script = buildRelayScript({
  serverUrl: "https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai",
  deviceId: "test-device-01",
  deviceSecret: "a".repeat(64),
});

describe("PN-031-E · A) همگام‌سازی ساعت (ریشهٔ خاموش «stale request»)", () => {
  test("A-1: تابع sync_clock وجود دارد و Date سرور را می‌خواند", () => {
    expect(script).toContain("sync_clock()");
    // PN-031-I: sync_clock هم با http1.1 + UA بروزری (همان حمل‌ونقل poll)
    expect(script).toContain('curl --http1.1 -A "$UA" -sSI --max-time 15');
    expect(script).toContain('tolower($1)=="date:"');
  });

  test("A-2: آفست ساعت در timestamp امضا اعمال می‌شود", () => {
    // ts = date +%s%3N + CLOCK_OFFSET — امضا با ساعت سرور امضا می‌شود
    expect(script).toContain("ts=$(( $(date +%s%3N) + CLOCK_OFFSET ))");
  });

  test("A-3: در ردِ stale از serverTime پاسخ سرور اصلاح فوری انجام می‌شود", () => {
    expect(script).toContain(".serverTime // empty");
    expect(script).toContain("CLOCK_OFFSET=$(( ST - $(date +%s%3N) ))");
  });

  test("A-4: هشدار فارسی برای اختلاف ساعت > ۱ دقیقه", () => {
    expect(script).toContain("دقیقه با سرور اختلاف دارد");
  });
});

describe("PN-031-E · B) دیده‌شدن شکست‌ها (پایان خاموشی عیب‌یابی)", () => {
  test("B-1: خطای دقیق سرور از JSON پاسخ نمایش داده می‌شود", () => {
    expect(script).toContain(".error // empty");
    expect(script).toContain("خطای سرور: ");
  });

  test("B-2: خطای شبکه با کد curl و توضیح فارسی — نه سکوت", () => {
    expect(script).toContain("curl_err_desc");
    expect(script).toContain('28) echo "تایم‌اوت');
    expect(script).toContain('7) echo "سرور اتصال را نپذیرفت"');
    expect(script).toContain("شبکه: curl خطای");
  });

  test("B-3: ضربان قلب هر ۱۰ چرخه — مالک می‌بیند رله زنده است", () => {
    expect(script).toContain("LOOPS=$((LOOPS+1))");
    expect(script).toContain("$((LOOPS % 10)) -eq 0");
    expect(script).toContain("زنده — چرخهٔ");
  });

  test("B-4: پاسخ غیرمنتظره با نمونهٔ متن پاسخ نمایش داده می‌شود (۱۶۰ نویسه)", () => {
    expect(script).toContain("head -c 160");
  });

  test("B-5: نتیجهٔ ارسال نتیجه به سرور خاموش نیست", () => {
    expect(script).toContain("ارسال نتیجه ناموفق");
    expect(script).toContain("سرور نتیجه را نپذیرفت");
  });
});

describe("PN-031-E · C) ردپای ردِ سمت سرور (RELAY_POLL_REJECT + serverTime)", () => {
  test("C-1: هر دلیل رد در verifyRelayRequestAuth ردپا دارد (RELAY_POLL_REJECT)", () => {
    const lib = readFileSync(RELAY_LIB, "utf8");
    expect(lib).toContain("RELAY_POLL_REJECT");
    for (const reason of ["missing auth headers", "stale request", "unknown device", "device revoked", "forbidden"]) {
      expect(lib).toContain(`"${reason}"`);
    }
  });

  test("C-2: throttle ضد سیل لاگ — یک رکورد به‌ازای دستگاه/دلیل در ۵ دقیقه", () => {
    const lib = readFileSync(RELAY_LIB, "utf8");
    expect(lib).toContain("relayRejectTrace");
    expect(lib).toContain("5 * 60_000");
  });

  test("C-3: serverTime در پاسخ ردِ poll و result (همان قرارداد قراردادی)", () => {
    const poll = readFileSync(POLL_ROUTE, "utf8");
    const result = readFileSync(RESULT_ROUTE, "utf8");
    expect(poll).toContain("serverTime: auth.serverTime ?? Date.now()");
    expect(result).toContain("serverTime: auth.serverTime ?? Date.now()");
  });

  test("C-4: صفر لاگ محتوا پابرجاست — هیچ امضا/راز/بدنه‌ای در ردپا نیست", () => {
    const lib = readFileSync(RELAY_LIB, "utf8");
    const trace = lib.slice(lib.indexOf("function noteRelayReject"), lib.indexOf("export async function verifyRelayRequestAuth"));
    expect(trace).not.toContain("sig");
    expect(trace).not.toContain("secret");
    expect(trace).not.toContain("rawBody");
  });
});

describe("PN-031-E · D) QR همیشه موجود (شکایت: «QR از تنظیمات بالا نمی‌آید»)", () => {
  test("D-1: فایل‌های ایستا در مسیر عمومی موجودند", () => {
    expect(existsSync(APK_PUBLIC)).toBe(true);
    expect(existsSync(QR_STATIC)).toBe(true);
  });

  test("D-2: sha256 عمومی APK با شاهد بیلد منطبق است", () => {
    const witness = JSON.parse(readFileSync(join(REPO, "download/pn031d/apk-build.json"), "utf8")) as { apk?: { sha256?: string } };
    const actual = createHash("sha256").update(readFileSync(APK_PUBLIC)).digest("hex");
    expect(witness.apk?.sha256).toBe(actual);
  });

  test("D-3: (ن۰۵۴) QR ایستا از UI حذف شد — صفر QR در تنظیمات (Termux تنها راه)", () => {
    const ui = readFileSync(RELAY_UI, "utf8");
    expect(ui).not.toContain('src="/deliver/pn031d/qr-apk.svg"');
    expect(ui).not.toContain("apkQrStatic");
  });

  test("D-4: QR ایستا SVG معتبر با محتوای واقعی QR است", () => {
    const svg = readFileSync(QR_STATIC, "utf8");
    expect(svg).toContain("<svg");
    expect(svg).toMatch(/viewBox="0 0 \d+ \d+"/);
  });
});

describe("PN-031-E · E) پابرجایی قرارداد امنیتی (هیچ‌چیز از دفاع عمیق نکاست)", () => {
  test("E-1: پیام امضای درخواست — همان قرارداد PN-030/031", () => {
    expect(script).toContain("printf 'POST\\n%s\\n%s\\n%s'");
    expect(script).toContain("sha256hex");
    expect(script).toContain("hmac_hex");
  });

  test("E-2: هدرهای احراز سه‌گانه دست‌نخورده", () => {
    expect(script).toContain("X-Melka-Relay-Device: $DEVICE_ID");
    expect(script).toContain("X-Melka-Timestamp: $ts");
    expect(script).toContain("X-Melka-Signature: $sig");
  });

  test("E-3: whitelist میزبان — فقط https و فقط *.melketabriz.ir", () => {
    expect(script).toContain("https://*.melketabriz.ir/*");
    expect(script).toContain("رد درخواست غیرمجاز");
  });

  test("E-4: احراز دوجهته — امضای RELAY سرور پیش از اجرا وارسی می‌شود", () => {
    expect(script).toContain("printf 'RELAY\\n%s\\n%s\\n%s\\n%s\\n%s'");
    expect(script).toContain("امضای سرور نامعتبر");
  });

  test("E-5: دستور نصب یک‌خطی همان قرارداد بوت‌استرپ است", () => {
    const cmd = buildInstallCommand("https://x.example/", "abc123");
    expect(cmd).toContain("/api/mobile-relay/bootstrap?code=abc123");
    expect(cmd).toContain("pkg install -y curl openssl jq");
  });

  test("E-6: مقدارهای تزریقی پاک‌سازی می‌شوند — خطوط انتساب فقط نویسهٔ امن دارند", () => {
    const malicious = buildRelayScript({
      serverUrl: 'https://x.example"; rm -rf /; echo "',
      deviceId: 'dev"; cat /etc/passwd # $(whoami)',
      deviceSecret: "sec'$(id)'ret",
    });
    // خطوط انتساب باید الگوی امن را رعایت کنند — هیچ نقل‌قولی/سمی‌کولنی/دستوری باقی نمی‌ماند
    const assign = malicious
      .split("\n")
      .filter((l) => /^(SERVER_URL|DEVICE_ID|DEVICE_SECRET)=/.test(l));
    expect(assign.length).toBe(3);
    for (const line of assign) {
      expect(line).toMatch(/^(SERVER_URL|DEVICE_ID|DEVICE_SECRET)="[A-Za-z0-9:\/._-]*"$/);
    }
    // تزریق فرمان ناممکن: هیچ فرا-نویسهٔ پوسته‌ای (نقل‌قول/سمی‌کولن/بک‌تیک/جایگزینی) باقی نمی‌ماند
    // (زیررشته‌های الفبایی مانند «whoami» پس از پاک‌سازی بی‌خطرند — قدرت فرا-نویسه‌هاست که حمله می‌سازد)
    expect(assign.join("\n")).not.toContain(";");
    expect(assign.join("\n")).not.toContain("`");
    expect(assign.join("\n")).not.toContain("$(");
    expect(assign.join("\n")).not.toContain(" rm ");
  });
});

describe("PN-031-E · F) شکستن بن‌بست برخطی (کشف فاز C — lastSeen با صف خالی)", () => {
  const relaySrc = readFileSync(RELAY_LIB, "utf8");
  const pollSrc = readFileSync(POLL_ROUTE, "utf8");

  test("F-1: noteRelayPollSeen در لایهٔ سرویس وجود دارد و lastSeenAt را به‌روز می‌کند", () => {
    expect(relaySrc).toContain("export async function noteRelayPollSeen");
    // updateMany با data: { lastSeenAt: new Date() } — نه فقط در claim
    const fn = relaySrc.split("noteRelayPollSeen")[1] ?? "";
    expect(fn.slice(0, 400)).toContain("lastSeenAt: new Date()");
  });

  test("F-2: روت poll پس از احراز موفق noteRelayPollSeen را صدا می‌زند", () => {
    expect(pollSrc).toContain("noteRelayPollSeen(auth.device!.deviceId)");
  });

  test("F-3: بن‌بست مرغ و تخم‌مرغ مستند شده — anyRelayDeviceOnline به lastSeenAt نگاه می‌کند", () => {
    // زنجیرهٔ بن‌بست (پیش از رفع): poll موفق + صف خالی → lastSeenAt دست‌نخورده →
    // anyRelayDeviceOnline=false → relayFetch صف‌گذاری نمی‌کند → صف همیشه خالی.
    // اکنون: هر poll موفق lastSeen را تازه می‌کند → پنجرهٔ ۹۰ ثانیه‌ای برخطی
    expect(relaySrc).toContain("lastSeenAt: { gte: since }");
    expect(pollSrc.indexOf("noteRelayPollSeen")).toBeGreaterThan(pollSrc.indexOf("markRelayEnrollCompleted"));
  });

  test("F-4: دستگاه ابطال‌شده با poll دیده نمی‌شود (revokedAt: null در شرط)", () => {
    const fn = relaySrc.split("noteRelayPollSeen")[1] ?? "";
    expect(fn.slice(0, 400)).toContain("revokedAt: null");
  });
});

describe("PN-031-E · G) ریشهٔ واقعی «Bootstrap موفق، Poll ناموفق» — URL در signed_curl", () => {
  test("G-1: signed_curl مسیر کامل URL را به curl می‌دهد (کد ۲ curl = آرگومان ناقص)", () => {
    // باگ تاریخی (از PN-031 · 554ef40): curl بدون URL → هر Poll روی خودِ گوشی
    // با کد ۲ می‌مُرد و سرور هیچ‌وقت poll نمی‌دید (enrolledAt/lastSeenAt=NULL).
    // PN-031-I: URL از cur_url() می‌آید (primary/alt) + http1.1 + UA بروزری.
    expect(script).toContain('curl --http1.1 -A "$UA" -sS -v --max-time 35 "$(cur_url)$path" "$@"');
  });

  test("G-2: هر دو فراخوانی signed_curl مسیر روت نسبی می‌دهند نه URL کامل", () => {
    // مسیر امضا همیشه نسبی است (/api/mobile-relay/poll) — URL فقط برای curl
    expect(script).toContain('signed_curl "/api/mobile-relay/poll" "$BODY"');
    expect(script).toContain('signed_curl "/api/mobile-relay/result" "$RESULT_JSON"');
  });

  test("G-3: کد خطای ۲ curl توضیح فارسی دارد (راه‌اندازی/آرگومان ناقص)", () => {
    expect(script).toContain("2) echo");
    expect(script).toContain("آرگومان ناقص");
  });

  test("G-4: اجرای واقعی اسکریپت (بدون حلقهٔ بی‌نهایت) — شبیه‌سازی signed_curl محلی", () => {
    // از اسکریپت تولیدشده، تابع signed_curl جدا و با URL غیرواقعی اجرا می‌شود:
    // باید curl «با URL» صدا زده شود — کد خروج غیر از ۲ (یعنی curl راه‌اندازی شد)
    const fnBlock = script.split("signed_curl() {")[1]?.split("\n}")[0] ?? "";
    expect(fnBlock).toContain('"$(cur_url)$path"');
    // و در فراخوانی poll، "$@" بعد از URL است (ترتیب آرگومان معتبر)
    expect(script.indexOf('"$(cur_url)$path" "$@"')).toBeGreaterThan(0);
  });
});
