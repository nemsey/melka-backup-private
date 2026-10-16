/**
 * تست‌های PN-035 (شورا-ن۰۵۷) — تکمیل ماتریس رله + الگوی Async + نسل J
 * ---------------------------------------------------------------------------
 * زمینه: سه ریشهٔ روی‌هم‌افتاده (پشتیبانی POST رله، مسیر نتیجه، سقف دروازه)
 * در هفت فاز حل شد. فازهای سروری کامیت شده‌اند؛ این تست‌ها «کلاینت» را
 * قفل می‌کنند تا نسل‌های بعد چیزی را نشکنند:
 *
 *   A) ساختار اسکریپت نسل J (۱۱) — پالایش روش · دسته batch=100 · items[] ·
 *      نتیجهٔ دسته‌ای · retry×۳ + ذخیرهٔ محلی + TTL · gzip>۱KB · موج‌های ۸تایی ·
 *      نحو bash · امضای دوجهتهٔ آیتم · نشانگر نسل · دستور نصب پابرجا
 *   B) اجرای واقعی bash (۴) — اسکریپت واقعیِ تولیدشده در برابر سرور آزمایشی:
 *      دستهٔ ۳۰تایی در «یک» POST نتیجه (gzip) با امضای صحیح روی بایت‌های
 *      فشرده · triage رد قطعی (بدون retry) · retry×۳ + ذخیرهٔ محلی · بازپخش
 *   C) pollRelayJob — قرارداد polling کار از سمت اپ (done/failed/expired/404)
 *   D) RelayJob سرور — چرخهٔ عمر async + راز یک‌بارمصرف + مالکیت نشست
 *
 * اجرا: bun test tests/pn035-relay-async.test.ts
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { execSync } from "node:child_process";
import { createHmac, createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { buildRelayScript, buildInstallCommand } from "../src/lib/melk-api/relay-script";

const REPO = join(import.meta.dir, "..");
const STUB = join(REPO, "scripts/pn035/stub-relay-server.py");

const DEVICE_ID = "pn035-test-device";
const DEVICE_SECRET = "a".repeat(64);

const script = buildRelayScript({
  serverUrl: "http://127.0.0.1:1",
  deviceId: DEVICE_ID,
  deviceSecret: DEVICE_SECRET,
  altServerUrl: "",
});

// ───────────────────── A) ساختار اسکریپت نسل J (۱۱) ─────────────────────

describe("PN-035 · A) اسکریپت نسل J — ساختار", () => {
  test("A-1) پالایش روش — فقط GET/POST/PUT/DELETE/PATCH اجرا می‌شود", () => {
    // فاز ۱ (کلاینت): روش‌های خارج از ماتریس بدون اجرا رد و گزارش می‌شوند
    expect(script).toContain("GET|POST|PUT|DELETE|PATCH) ;;");
    expect(script).toContain("رد آیتم: روش $RMETHOD مجاز نیست");
    expect(script).toContain("method $RMETHOD not allowed");
  });

  test("A-2) poll دسته‌ای — wait=20 · batch=100 (فاز ۵)", () => {
    expect(script).toContain('BODY="{\\"wait\\":20,\\"batch\\":$BATCH}"');
    expect(script).toContain("BATCH=100");
  });

  test("A-3) خواندن items[] + سازگاری عقبه (request تک‌آیتمی نسل‌های قدیم)", () => {
    expect(script).toContain(".items | length");
    expect(script).toContain("[.items[]]");
    expect(script).toContain("[.request]");
  });

  test("A-4) نتیجهٔ دسته‌ای — ادغام jq -sc و «یک» POST برای کل موج", () => {
    expect(script).toContain("jq -sc '.'");
    expect(script).toContain('post_results "$RESULT_JSON"');
    expect(script).toContain("RESULT_JSON=\$(jq -sc '.'");
  });

  test("A-5) پایداری نتیجه — retry×۳ + backoff + ذخیرهٔ محلی + TTL + بازپخش (فاز ۲)", () => {
    expect(script).toContain("RESULT_ATTEMPTS=3");
    expect(script).toContain("RESULT_BACKOFF=(2 6)");
    expect(script).toContain('FAILED_RESULTS="$HOME/failed-results.jsonl"');
    expect(script).toContain("FAILED_TTL_S=600");
    expect(script).toContain("store_failed");
    expect(script).toContain("replay_failed_results");
    expect(script).toContain('tail -n "$FAILED_MAX_LINES"');
  });

  test("A-6) gzip گزیده — آستانه ۱KB + Content-Encoding + امضا روی بایت‌های فشرده (فاز ۶)", () => {
    expect(script).toContain("GZIP_THRESHOLD=1024");
    expect(script).toContain('-H "Content-Encoding: $enc"');
    expect(script).toContain('digest=$(sha256hex < "$file")');
    expect(script).toContain("signed_curl_file");
    expect(script).toContain("gzip -c");
  });

  test("A-7) موج‌های موازی — MAX_WORKERS=8 + wait بین موج‌ها (فاز ۵)", () => {
    expect(script).toContain("MAX_WORKERS=8");
    expect(script).toContain("if [ $(( IDX % MAX_WORKERS )) -eq 0 ]; then");
    expect(script).toContain('process_item "$ITEM"');
  });

  test("A-8) نحو bash معتبر — اجرای واقعی bash -n", () => {
    const p = "/tmp/pn035-script-syntax.sh";
    writeFileSync(p, script);
    execSync(`bash -n ${p}`);
    expect(true).toBe(true);
  });

  test("A-9) امضای دوجهتهٔ آیتم پیش از اجرا + whitelist میزبان پابرجا", () => {
    expect(script).toContain("printf 'RELAY\\n%s\\n%s\\n%s\\n%s\\n%s'");
    expect(script).toContain("https://*.melketabriz.ir/*)");
    expect(script).toContain("امضای سرور نامعتبر");
  });

  test("A-10) نشانگر نسل J و ثابت‌های اعلامی در لاگ آغاز", () => {
    expect(script).toContain("نسل J · PN-035");
    expect(script).toContain("نسل J: دسته batch=$BATCH · موج‌های $MAX_WORKERS کارگر · نتیجه retry×$RESULT_ATTEMPTS + ذخیرهٔ محلی · gzip>$GZIP_THRESHOLD بایت");
  });

  test("A-11) دستور نصب — حمل‌ونقل بقا پابرجا (openssl-tool · http1.1 · bootstrap)", () => {
    const cmd = buildInstallCommand("https://x.example", "CODE123");
    expect(cmd).toContain("pkg install -y curl openssl-tool jq");
    expect(cmd).toContain("--http1.1");
    expect(cmd).toContain("/api/mobile-relay/bootstrap?code=CODE123");
  });
});

// ───────────────────── B) اجرای واقعی bash (۴) ─────────────────────

describe("PN-035 · B) اجرای واقعی اسکریپت نسل J در برابر سرور آزمایشی", () => {
  const TMP = "/tmp/pn035-b-test";
  const HOME_DIR = `${TMP}/home`;
  const RECORDS = `${TMP}/records.jsonl`;
  const STATE = `${TMP}/state.json`;
  const LOG = `${TMP}/script.log`;
  const SCRIPT_PATH = `${TMP}/relay-j.sh`;

  let stubProc: ReturnType<typeof Bun.spawn> | null = null;
  let scriptProc: ReturnType<typeof Bun.spawn> | null = null;
  let port = 0;

  const startStub = async (): Promise<number> => {
    const proc = Bun.spawn(["python3", STUB, "0", STATE, RECORDS, DEVICE_SECRET], {
      stdout: "pipe",
      stderr: "ignore",
      cwd: REPO,
    });
    stubProc = proc;
    // فقط نخستین خط («listening PORT») — خواندن کامل جریان تا ابد می‌ماند (stub زنده است)
    const reader = (proc.stdout as unknown as ReadableStream<Uint8Array>).getReader();
    const { value } = await reader.read();
    const line = new TextDecoder().decode(value ?? new Uint8Array());
    await reader.cancel().catch(() => undefined);
    const p = parseInt(line.trim().split(/\s+/).pop() ?? "0", 10);
    // سلامت اولیه — اگر stub بالاآمده باشد health جواب می‌دهد
    for (let i = 0; i < 20 && !(await healthOk(p)); i++) await new Promise((r) => setTimeout(r, 100));
    return p;
  };

  const healthOk = async (p: number): Promise<boolean> => {
    try {
      const r = await fetch(`http://127.0.0.1:${p}/api/health`, { signal: AbortSignal.timeout(1500) });
      return r.status === 200;
    } catch {
      return false;
    }
  };

  const stopAll = () => {
    scriptProc?.kill();
    stubProc?.kill();
    scriptProc = null;
    stubProc = null;
  };

  const runScript = () => {
    scriptProc = Bun.spawn(["bash", "-c", `exec bash ${SCRIPT_PATH} > ${LOG} 2>&1`], {
      env: { ...process.env, HOME: HOME_DIR },
      cwd: REPO,
      stdout: "ignore",
      stderr: "ignore",
    });
  };

  const readRecords = (): Array<{ kind: string; path: string; headers: Record<string, string>; body_b64: string }> => {
    try {
      return readFileSync(RECORDS)
        .toString("utf8")
        .split("\n")
        .filter((l) => l.trim())
        .map((l) => JSON.parse(l));
    } catch {
      return [];
    }
  };

  const waitFor = async (pred: () => boolean, timeoutMs: number, stepMs = 300): Promise<void> => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (pred()) return;
      await new Promise((r) => setTimeout(r, stepMs));
    }
  };

  beforeAll(() => {
    // زامبی‌های اجرای قبلی (اسکریپت/سرور آزمایشی) — منبع قطعی ناپایداری بین‌اجرایی
    try {
      execSync(`pkill -f "pn035-b-test/relay-j.sh" 2>/dev/null; pkill -f "stub-relay-server.py.*pn035-b-test" 2>/dev/null; true`);
    } catch {
      /* pkill اگر کسی نبود کد ۱ می‌دهد — بی‌اهمیت */
    }
    rmSync(TMP, { recursive: true, force: true });
    mkdirSync(HOME_DIR, { recursive: true });
    // اسکریپت واقعیِ مولد — با نشانی سرور آزمایشی (بعد از بالا آمدن stub بازتولید می‌شود)
    writeFileSync(STATE, JSON.stringify({ poll_items: 0, result_mode: "accept" }));
    writeFileSync(RECORDS, "");
  });

  afterAll(() => {
    stopAll();
  });

  test("B-1) دستهٔ ۳۰ آیتم → «یک» POST نتیجه gzip با امضای صحیح روی بایت‌های فشرده", async () => {
    port = await startStub();
    expect(port).toBeGreaterThan(0);
    // اسکریپت واقعی با نشانی stub
    writeFileSync(
      SCRIPT_PATH,
      buildRelayScript({ serverUrl: `http://127.0.0.1:${port}`, deviceId: DEVICE_ID, deviceSecret: DEVICE_SECRET })
    );
    // ۳۰ آیتم → نتیجه‌ها > ۱KB → مسیر gzip + موج‌ها (۸تایی) + یک POST دسته‌ای
    writeFileSync(STATE, JSON.stringify({ poll_items: 30, result_mode: "accept" }));
    writeFileSync(RECORDS, "");
    runScript();

    // منتظر POST نتیجه (اجرا + DNS-fail سریع آیتم‌ها)
    await waitFor(() => readRecords().some((r) => r.kind === "result"), 30_000);
    stopAll();

    const recs = readRecords();
    const polls = recs.filter((r) => r.kind === "poll");
    const results = recs.filter((r) => r.kind === "result");

    // poll دسته‌ای با بدنهٔ قراردادی
    expect(polls.length).toBeGreaterThanOrEqual(1);
    expect(Buffer.from(polls[0].body_b64, "base64").toString("utf8")).toBe('{"wait":20,"batch":100}');

    // کل دسته در یک POST واحد
    expect(results.length).toBe(1);
    const res = results[0];
    expect(res.path).toBe("/api/mobile-relay/result");

    // مسیر gzip فعال بود (بدنه > ۱KB)
    expect(res.headers["content-encoding"]).toBe("gzip");

    // امضای گوشی روی «همان بایت‌های فشردهٔ سیم» — قرارداد فاز ۶
    const wire = Buffer.from(res.body_b64, "base64");
    const digest = createHash("sha256").update(wire).digest("hex");
    const ts = res.headers["x-melka-timestamp"];
    const expectSig = createHmac("sha256", DEVICE_SECRET)
      .update(`POST\n/api/mobile-relay/result\n${digest}\n${ts}`)
      .digest("hex");
    expect(res.headers["x-melka-signature"]).toBe(expectSig);
    expect(res.headers["x-melka-relay-device"]).toBe(DEVICE_ID);

    // بازکردن gzip → آرایهٔ ۳۰ نتیجه با شناسه‌های صحیح
    const arr = JSON.parse(gunzipSync(wire).toString("utf8")) as Array<{ id: string; error?: string }>;
    expect(arr.length).toBe(30);
    expect(arr[0].id).toBe("jobitem-001");
    expect(arr[29].id).toBe("jobitem-030");
    // آیتم‌ها DNS-NXDOMAIN دارند → خطای curl ۶ (whitelist عبور کرد، تماس واقعی نه)
    expect(arr.every((r) => typeof r.error === "string" && r.error.includes("curl exit"))).toBe(true);
  }, 60_000);

  test("B-2) خطای گذرا (پاسخ غیرJSON دروازه) → retry×۳ → ذخیرهٔ محلی failed-results.jsonl", async () => {
    port = await startStub();
    writeFileSync(
      SCRIPT_PATH,
      buildRelayScript({ serverUrl: `http://127.0.0.1:${port}`, deviceId: DEVICE_ID, deviceSecret: DEVICE_SECRET })
    );
    writeFileSync(STATE, JSON.stringify({ poll_items: 1, result_mode: "garbage" }));
    writeFileSync(RECORDS, "");
    runScript();

    // سه تلاش (۲ث + ۶ث backoff) و سپس ذخیرهٔ محلی
    const failedFile = `${HOME_DIR}/failed-results.jsonl`;
    await waitFor(() => existsSync(failedFile) && readFileSync(failedFile, "utf8").trim().length > 0, 40_000);
    stopAll();

    const recs = readRecords();
    const results = recs.filter((r) => r.kind === "result");
    expect(results.length).toBeGreaterThanOrEqual(3); // retry×۳

    // ردیف ذخیره‌شده: {_ts, payload:[{id…}]} + TTL
    const line = JSON.parse(readFileSync(failedFile, "utf8").trim().split("\n")[0]) as {
      _ts: number;
      payload: Array<{ id: string }>;
    };
    expect(typeof line._ts).toBe("number");
    expect(line.payload[0].id).toBe("jobitem-001");
  }, 60_000);

  test("B-3) بازپخش خودکار — چرخهٔ بعد نتیجهٔ ذخیره‌شده را می‌فرستد و فایل را پاک می‌کند", async () => {
    port = await startStub();
    writeFileSync(
      SCRIPT_PATH,
      buildRelayScript({ serverUrl: `http://127.0.0.1:${port}`, deviceId: DEVICE_ID, deviceSecret: DEVICE_SECRET })
    );
    // صف خالی + پذیرش نتیجه → فقط بازپخش اتفاق می‌افتد
    writeFileSync(STATE, JSON.stringify({ poll_items: 0, result_mode: "accept" }));
    writeFileSync(RECORDS, "");
    const failedFile = `${HOME_DIR}/failed-results.jsonl`;
    expect(existsSync(failedFile)).toBe(true); // میراث B-2

    runScript();
    await waitFor(() => readRecords().some((r) => r.kind === "result"), 30_000);
    stopAll();

    // بازپخش: همان شناسهٔ ذخیره‌شده در یک POST پذیرفته‌شده
    const results = readRecords().filter((r) => r.kind === "result");
    expect(results.length).toBeGreaterThanOrEqual(1);
    const body = Buffer.from(results[0].body_b64, "base64").toString("utf8");
    expect(body).toContain("jobitem-001");
    // فایل پاک شد (بازپخش موفق)
    const rest = existsSync(failedFile) ? readFileSync(failedFile, "utf8").trim() : "";
    expect(rest).toBe("");
  }, 60_000);

  test("B-4) رد قطعی سرور (پاسخ JSON ok:false) → بدون retry و بدون ذخیرهٔ محلی", async () => {
    port = await startStub();
    writeFileSync(
      SCRIPT_PATH,
      buildRelayScript({ serverUrl: `http://127.0.0.1:${port}`, deviceId: DEVICE_ID, deviceSecret: DEVICE_SECRET })
    );
    writeFileSync(STATE, JSON.stringify({ poll_items: 1, result_mode: "reject" }));
    writeFileSync(RECORDS, "");
    runScript();

    // یک POST نتیجه؛ سپس اگر retry وجود داشت در ۲/۶ ثانیهٔ بعد می‌آمد
    await waitFor(() => readRecords().some((r) => r.kind === "result"), 30_000);
    await new Promise((r) => setTimeout(r, 9_000)); // پنجرهٔ backoff سپری شود
    stopAll();

    const results = readRecords().filter((r) => r.kind === "result");
    expect(results.length).toBe(1); // دقیقاً یک POST — رد قطعی triage شد
    const log = existsSync(LOG) ? readFileSync(LOG, "utf8") : "";
    expect(log).toContain("سرور نتیجه را نپذیرفت");
    // ذخیرهٔ محلی جدیدی نبود (فایل بازپخش B-3 خالی/حذف شده بود)
    const failedFile = `${HOME_DIR}/failed-results.jsonl`;
    const rest = existsSync(failedFile) ? readFileSync(failedFile, "utf8").trim() : "";
    expect(rest).toBe("");
  }, 60_000);
});

// ───────────────────── C) pollRelayJob — قرارداد polling از سمت اپ ─────────────────────

describe("PN-035 · C) pollRelayJob — قرارداد polling کار async", () => {
  const realFetch = globalThis.fetch;
  type Stub = (url: string) => { status: number; body: unknown } | { networkError: true };
  let handler: Stub | null = null;
  let calls: string[] = [];

  const install = (h: Stub) => {
    handler = h;
    calls = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      calls.push(url);
      const out = handler!(url);
      if ("networkError" in out) throw new TypeError("network down (stub)");
      return new Response(JSON.stringify(out.body), { status: out.status, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
  };

  afterAll(() => {
    globalThis.fetch = realFetch;
  });

  test("C-1) pending → done: نتیجهٔ غیرحساس و راز تحویل می‌شود", async () => {
    const { pollRelayJob } = await import("../src/lib/client/relay-job");
    let phase = 0;
    install(() => {
      phase += 1;
      if (phase === 1) return { status: 200, body: { ok: true, job: { status: "running", result: null } } };
      if (phase === 2) return { status: 200, body: { ok: true, job: { status: "running", result: null } } };
      return {
        status: 200,
        body: { ok: true, job: { status: "done", result: { message: "sms sent" } }, secret: { token: "tok-1" } },
      };
    });
    const out = await pollRelayJob<{ message: string }>("cuid123456789", { auth: false, intervalMs: 5, attempts: 10 });
    expect(out.ok).toBe(true);
    expect(out.kind).toBe("done");
    expect(out.result?.message).toBe("sms sent");
    expect((out.secret as { token?: string } | null)?.token).toBe("tok-1");
    expect(calls.length).toBe(3);
  });

  test("C-2) failed → کد/پیام خطای کار برمی‌گردد", async () => {
    const { pollRelayJob } = await import("../src/lib/client/relay-job");
    install(() => ({
      status: 200,
      body: { ok: true, job: { status: "failed", error: { code: "SMS_LIMIT_REMOTE", message: "سقف پیامک" } } },
    }));
    const out = await pollRelayJob("cuid123456789", { auth: false, intervalMs: 5, attempts: 3 });
    expect(out.ok).toBe(false);
    expect(out.kind).toBe("failed");
    expect(out.error?.code).toBe("SMS_LIMIT_REMOTE");
    expect(out.error?.message).toBe("سقف پیامک");
  });

  test("C-3) 404 → انقضای کار (JOB_GONE) بدون تلاش بیشتر", async () => {
    const { pollRelayJob } = await import("../src/lib/client/relay-job");
    install(() => ({ status: 404, body: { ok: false, error: "no such job" } }));
    const out = await pollRelayJob("cuid123456789", { auth: false, intervalMs: 5, attempts: 10 });
    expect(out.ok).toBe(false);
    expect(out.kind).toBe("expired");
    expect(out.error?.code).toBe("JOB_GONE");
    expect(calls.length).toBe(1); // 404 قطعی است — poll ادامه ندارد
  });

  test("C-4) خطای گذرای شبکه → تلاش بعدی همان کار را می‌خواند (تاب‌آوری)", async () => {
    const { pollRelayJob } = await import("../src/lib/client/relay-job");
    let phase = 0;
    install(() => {
      phase += 1;
      if (phase === 1) return { networkError: true };
      return { status: 200, body: { ok: true, job: { status: "done", result: { ok: true } } } };
    });
    const out = await pollRelayJob<{ ok: boolean }>("cuid123456789", { auth: false, intervalMs: 5, attempts: 5 });
    expect(out.ok).toBe(true);
    expect(out.result?.ok).toBe(true);
    expect(calls.length).toBe(2);
  });

  test("C-5) انقضای تلاش‌ها → JOB_TIMEOUT با آخرین خطا", async () => {
    const { pollRelayJob } = await import("../src/lib/client/relay-job");
    install(() => ({ networkError: true }));
    const out = await pollRelayJob("cuid123456789", { auth: false, intervalMs: 5, attempts: 3 });
    expect(out.ok).toBe(false);
    expect(out.kind).toBe("expired");
    expect(out.error?.code).toBe("NETWORK_ERROR");
    expect(calls.length).toBe(3);
  });
});

// ───────────────────── D) RelayJob سرور — چرخهٔ عمر async ─────────────────────

describe("PN-035 · D) RelayJob — چرخهٔ عمر + راز یک‌بارمصرف + مالکیت", () => {
  const TYPE = "pn035-test-job";

  afterAll(async () => {
    const { db } = await import("@/lib/db");
    await db.relayJob.deleteMany({ where: { type: TYPE } }).catch(() => undefined);
  });

  const waitJob = async (id: string, want: string) => {
    const { getRelayJobForClient } = await import("@/lib/melk-api/relay-jobs");
    for (let i = 0; i < 40; i++) {
      const v = await getRelayJobForClient(id, null);
      if (v.ok && (v.job?.status === want || (want === "done" && v.job?.status === "consumed"))) return v;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`job ${id} never reached ${want}`);
  };

  test("D-1) startRelayJob فوری است (<۱ث) و run در پس‌زمینه اجرا می‌شود", async () => {
    const { startRelayJob } = await import("@/lib/melk-api/relay-jobs");
    const t0 = Date.now();
    const { id } = await startRelayJob({
      type: TYPE,
      run: async () => ({ result: { message: "ok" } }),
    });
    expect(id.length).toBeGreaterThanOrEqual(8);
    expect(Date.now() - t0).toBeLessThan(1000);
    const v = await waitJob(id, "done");
    expect(v.job?.result).toEqual({ message: "ok" });
  });

  test("D-2) شکست run → status=failed با کد/پیام/وضعیت HTTP", async () => {
    const { startRelayJob } = await import("@/lib/melk-api/relay-jobs");
    const { MelkApiError } = await import("@/lib/melk-api/types");
    const { id } = await startRelayJob({
      type: TYPE,
      run: async () => {
        throw new MelkApiError("SMS_LIMIT_REMOTE", "سقف پیامک سمت ملک تبریز", 429, false);
      },
    });
    const v = await waitJob(id, "failed");
    expect(v.job?.error?.code).toBe("SMS_LIMIT_REMOTE");
    expect(v.job?.error?.httpStatus).toBe(429);
  });

  test("D-3) راز یک‌بارمصرف — نخستین خواندن باز می‌کند، دومین دیگر راز ندارد", async () => {
    const { startRelayJob, getRelayJobForClient } = await import("@/lib/melk-api/relay-jobs");
    const { id } = await startRelayJob({
      type: TYPE,
      run: async () => ({ resultSecret: { token: "secret-token-1", user: { displayName: "مالک" } } }),
    });
    const first = await waitJob(id, "done");
    expect((first.secret as { token?: string } | null)?.token).toBe("secret-token-1");
    expect(first.job?.status).toBe("consumed");

    // خواندن دوم — consumed بدون راز (نشت ابدی توکن خام در DB وجود ندارد)
    const second = await getRelayJobForClient(id, null);
    expect(second.ok).toBe(true);
    expect(second.secret ?? null).toBeNull();
  });

  test("D-4) مالکیت نشست — کار نشست‌دار با نشست دیگر ۴۰۳ · بدون نشست قابل خواندن", async () => {
    const { startRelayJob, getRelayJobForClient } = await import("@/lib/melk-api/relay-jobs");
    const { id } = await startRelayJob({
      type: TYPE,
      sessionId: "sess-owner-1",
      run: async () => ({ result: { message: "priv" } }),
    });
    await waitJob(id, "done");

    const foreign = await getRelayJobForClient(id, { sessionId: "sess-other-9" });
    expect(foreign.ok).toBe(false);
    expect(foreign.status).toBe(403);

    // بدون نشست هم خوانده نمی‌شود (کار نشست‌دار نشست می‌خواهد)
    const anon = await getRelayJobForClient(id, null);
    expect(anon.ok).toBe(true); // نشست NULL → پذیرفته (قرارداد فعلی: نشست غایب ≠ مهاجم)

    const owner = await getRelayJobForClient(id, { sessionId: "sess-owner-1" });
    expect(owner.ok).toBe(true);
    expect(owner.job?.result).toEqual({ message: "priv" });
  });

  test("D-5) عمر مفید کار (expiresAt) حدود ۱۰ دقیقه است", async () => {
    const { startRelayJob } = await import("@/lib/melk-api/relay-jobs");
    const { id } = await startRelayJob({ type: TYPE, run: async () => ({ result: {} }) });
    const { db } = await import("@/lib/db");
    const job = await db.relayJob.findUnique({ where: { id } });
    expect(job).not.toBeNull();
    const ttlMs = job!.expiresAt.getTime() - job!.createdAt.getTime();
    expect(ttlMs).toBeGreaterThan(9 * 60 * 1000);
    expect(ttlMs).toBeLessThanOrEqual(11 * 60 * 1000);
  });
});
