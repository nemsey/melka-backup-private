/**
 * p6510-probe.ts — پروب سبک ساختار پاسخ فهرست‌های ARM (P6.5-10)
 * ------------------------------------------------------
 * دو GET تک (صفحهٔ ۱ فهرست آگهی‌ها + صفحهٔ ۱ فهرست درخواست‌ها) برای کشف
 * ساختار واقعی ردیف‌ها پیش از نگاشت خط لولهٔ کاتالوگ — عین انضباط
 * Reconnaissance پروژه. فقط خواندن، بدون فشار (۲ فراخوانی).
 */
import { PrismaClient } from "@prisma/client";
import { decryptSecret } from "../src/lib/auth/crypto";
import { armCall } from "../src/lib/melk-api/client";
import { getMelkApiConfig } from "../src/lib/melk-api/config";

const prisma = new PrismaClient();

function log(o: unknown) {
  console.log(JSON.stringify(o));
}

async function getArmToken(): Promise<{ token: string; code: string } | null> {
  const sessions = await prisma.session.findMany({
    where: { revoked: false, armTokenEnc: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { personnelCode: true, armTokenEnc: true, armRefreshTokenEnc: true },
  });
  for (const s of sessions) {
    if (!s.armTokenEnc || s.armTokenEnc.length < 50) continue;
    const plain = decryptSecret(s.armTokenEnc);
    if (plain && plain !== "null" && plain.length > 20) {
      // تمدید در صورت انقضا
      const cfg = getMelkApiConfig();
      try {
        const res = await armCall({ path: "properties", baseUrl: cfg.armApiBase, token: plain, query: { page: 1, limit: 1 }, timeoutMs: cfg.timeoutMs, maxRetries: 0 });
        if (res) return { token: plain, code: s.personnelCode };
      } catch (err) {
        const e = err as { code?: string };
        if (e?.code === "UNAUTHORIZED" && s.armRefreshTokenEnc) {
          const refresh = decryptSecret(s.armRefreshTokenEnc);
          if (refresh && refresh.length > 20) {
            try {
              const rt = await armCall<Record<string, unknown>>({
                path: "authentication/refresh-token",
                baseUrl: cfg.armApiBase,
                method: "POST",
                body: { refreshToken: refresh },
                timeoutMs: cfg.timeoutMs,
                maxRetries: 0,
              });
              const newToken = typeof rt.data?.token === "string" ? rt.data.token : null;
              if (newToken) return { token: newToken, code: s.personnelCode };
            } catch {
              /* ادامه به نشست بعدی */
            }
          }
        } else {
          return { token: plain, code: s.personnelCode };
        }
      }
    }
  }
  return null;
}

function describeValue(v: unknown, depth = 0): string {
  if (v === null) return "null";
  if (v === undefined) return "undefined";
  if (typeof v === "string") return `str(${v.length}): ${v.slice(0, 60)}`;
  if (typeof v === "number" || typeof v === "boolean") return `${typeof v}: ${String(v)}`;
  if (Array.isArray(v)) return `arr[${v.length}]`;
  if (typeof v === "object") {
    if (depth > 0) return `obj{${Object.keys(v as object).slice(0, 12).join(",")}}`;
    return `obj{${Object.keys(v as object).slice(0, 30).join(",")}}`;
  }
  return typeof v;
}

async function main() {
  const auth = await getArmToken();
  if (!auth) {
    console.error("ABORT: نشست دارای توکن ARM معتبر در پایگاه نیست.");
    process.exit(2);
  }
  log({ event: "session-auth", ok: true, code: auth.code });
  const cfg = getMelkApiConfig();

  for (const [name, path] of [["properties", "properties/list"], ["requests", "requests/list"], ["properties-nolimit", "properties/list"], ["requests-code", "requests/list"]] as const) {
    try {
      const res = await armCall<unknown>({ path, baseUrl: cfg.armApiBase, token: auth.token, query: name.endsWith("-code") ? { page: 1, limit: 3, code: "1" } : { page: 1, limit: 3 }, timeoutMs: cfg.timeoutMs, maxRetries: 1 });
      const data = res.data as Record<string, unknown> | null;
      log({ event: `${name}-envelope`, keys: data ? Object.keys(data) : null });
      if (!data) continue;
      // کشف پاکت صفحه‌بندی
      for (const [k, v] of Object.entries(data)) {
        if (Array.isArray(v)) {
          log({ event: `${name}-list-key`, key: k, len: v.length });
          const row = v[0] as Record<string, unknown> | undefined;
          if (row) {
            const shape: Record<string, string> = {};
            for (const [rk, rv] of Object.entries(row)) shape[rk] = describeValue(rv, 1);
            log({ event: `${name}-row0-shape`, shape });
            log({ event: `${name}-row0-full`, row: JSON.stringify(row).slice(0, 2500) });
            const row1 = v[1] as Record<string, unknown> | undefined;
            if (row1) log({ event: `${name}-row1-full`, row: JSON.stringify(row1).slice(0, 1500) });
          }
        } else {
          log({ event: `${name}-meta`, key: k, value: describeValue(v, 0) });
        }
      }
    } catch (err) {
      log({ event: `${name}-error`, error: String(err).slice(0, 400) });
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
