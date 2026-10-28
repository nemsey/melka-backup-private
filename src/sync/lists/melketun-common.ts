/**
 * melketun-common.ts — PN-051 — لایهٔ اتصال مشترک M7/M8 به موتور کشف‌شدهٔ legacy
 * ---------------------------------------------------------------------------
 * فرمان ۳: «کدهای sync قبلی را حذف نکن — منطق‌های کشف‌شده (پارس HTML ·
 * CookieJar · Inertia · فیلتر تبریز) از دست نروند.»
 * این لایه صرفاً exportهای رسمی src/lib/integrations/melketun/sync.ts را
 * دوباره صادر می‌کند + خواندن راز (الگوی loadSecrets همان ماژول) — صفر کپی.
 */

export {
  crmLogin,
  syncMelketunRows,
  parseMelketunAreas,
  MELKETUN_TENANT_ID,
  KNOWN_BAD_POTENTIAL_PAGES,
  extractInertiaProps,
  type FilingRow,
} from "@/lib/integrations/melketun/sync";

/** ساختار ردیف درخواست ملکتون — عین PotentialRow داخلی sync.ts (خارجی نیست) */
export interface PotentialRow {
  id: string;
  full_id?: string;
  code?: string;
  potentialName?: string;
  customerType?: string;
  price?: string | number;
  rent?: number | string;
  prepayment?: number | string;
  areas?: string;
  contactName?: string;
  contactMobile?: string;
  agency?: string;
  assignedUser?: string;
  propertyType?: string;
  createdTime?: string;
  starred?: boolean;
  status?: string;
  source?: string;
  [key: string]: unknown;
}

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface MelketunSecrets {
  crm: { base_url: string; username: string; password: string };
}

/** راز ملکتون — عین الگوی loadSecrets (Persistent Zone · gitignored) */
export function loadSecretsFile(): MelketunSecrets | null {
  try {
    const file = join(process.env.MELKA_REPO_DIR ?? "/home/z/my-project", "upload/.runtime/melketun-secrets.json");
    if (!existsSync(file)) return null;
    const raw = JSON.parse(readFileSync(file, "utf8")) as MelketunSecrets;
    if (!raw?.crm?.base_url || !raw?.crm?.username) return null;
    return raw;
  } catch {
    return null;
  }
}

/** نوع بازگرداندهٔ fetchModule این لایه — ردیف اینرسیا خام */
export interface ModuleRows {
  rows: Array<Record<string, unknown>>;
  badPages: number[];
}

/** خواندن یک ماژول Inertia با نشست تازه — شکست → badPages/errors صادقانه */
export async function fetchModuleRows(
  baseUrl: string,
  secrets: MelketunSecrets,
  pagePath: string,
  propKey: string,
  errors: string[],
  maxPages?: number
): Promise<Array<Record<string, unknown>>> {
  const mod = await import("@/lib/integrations/melketun/sync");
  const jar = await mod.crmLogin(baseUrl, secrets.crm.username, secrets.crm.password, errors);
  const pageFn = (n: number) => `${pagePath}${n > 1 ? `/${n}` : ""}`;
  const knownBad = propKey === "potentials" ? mod.KNOWN_BAD_POTENTIAL_PAGES : new Set<number>();
  const result = await mod.fetchModule(baseUrl, jar, pageFn, propKey, errors, knownBad);
  if (maxPages && result.rows.length > maxPages * 10) {
    return result.rows.slice(0, maxPages * 10) as Array<Record<string, unknown>>;
  }
  return result.rows as Array<Record<string, unknown>>;
}
