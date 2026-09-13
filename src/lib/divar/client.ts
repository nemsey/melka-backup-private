/**
 * کلاینت HTTP دیوار — وب عمومی + کنار رسمی + ورود پیامکی
 * همه فراخوانی‌ها با UA مرورگر، مهلت زمانی و تلاش مجدد.
 */

import { DIVAR_CONFIG } from "./config";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

export class DivarApiError extends Error {
  code: string;
  status: number;
  retryable: boolean;
  constructor(code: string, message: string, status: number, retryable = false) {
    super(message);
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

async function fetchJson(
  url: string,
  init: RequestInit & { timeoutMs?: number; retries?: number } = {}
): Promise<unknown> {
  const { timeoutMs = DIVAR_CONFIG.timeoutMs, retries = DIVAR_CONFIG.maxRetries, ...rest } = init;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        ...rest,
        signal: controller.signal,
        headers: {
          "User-Agent": BROWSER_UA,
          "Accept": "application/json, text/plain, */*",
          ...(rest.body ? { "Content-Type": "application/json" } : {}),
          ...(rest.headers ?? {}),
        },
      });
      clearTimeout(timer);
      const text = await res.text();
      let payload: unknown = null;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        payload = text;
      }
      if (!res.ok) {
        const p = payload as { message?: string; error?: string } | null;
        const msg = p?.message ?? p?.error ?? `پاسخ ناموفق دیوار (${res.status})`;
        const retryable = res.status >= 500 || res.status === 429;
        if (retryable && attempt < retries) {
          lastErr = new DivarApiError("UPSTREAM_ERROR", msg, res.status, true);
          await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
          continue;
        }
        throw new DivarApiError("UPSTREAM_ERROR", msg, res.status, retryable);
      }
      return payload;
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof DivarApiError && !err.retryable) throw err;
      lastErr = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
        continue;
      }
    }
  }
  throw new DivarApiError("NETWORK", "ارتباط با دیوار برقرار نشد. لطفاً دوباره تلاش کنید.", 0, true);
}

// ===================== ۱) جست‌وجوی وب (عمومی — بدون کلید) =====================

export interface DivarSearchRow {
  token: string;
  title: string;
  priceText: string | null;
  redText: string | null;
  imageCount: number;
  imageUrl: string | null;
  topText: string | null;
}

export interface DivarSearchPage {
  rows: DivarSearchRow[];
  hasMore: boolean;
  page: number;
  lastPostDate: string | null;
  searchUid: string | null;
  viewedTokens: string | null;
}

interface WebSearchWidget {
  widget_type?: string;
  data?: Record<string, unknown>;
}

interface WebSearchResponse {
  list_widgets?: WebSearchWidget[];
  pagination?: { has_next_page?: boolean; data?: { last_post_date?: string; page?: number; search_uid?: string; viewed_tokens?: string } };
}

/**
 * جست‌وجوی آگهی‌های تبریز — شکل دقیق درخواست از وب‌سایت رسمی دیوار رهگیری شد.
 * مرتب‌سازی پیش‌فرض: sort_date (تغییر). فیلتر زمانِ واقعی انتشار در موتور اسکن
 * با خواندن «انتشار آگهی» از جزئیات هر آگهی اعمال می‌شود (دیوار نردبان‌شده‌ها را بالا می‌آورد).
 */
export async function webSearchTabriz(input: {
  category: string;
  page?: number;
  searchUid?: string | null;
  viewedTokens?: string | null;
  lastPostDate?: string | null;
}): Promise<DivarSearchPage> {
  const form: Record<string, unknown> = {
    category: { str: { value: input.category } },
  };
  const payload: Record<string, unknown> = {
    source_view: "FILTER",
    disable_recommendation: false,
    search_data: {
      form_data: { data: form },
      server_payload: {
        "@type": "type.googleapis.com/widgets.SearchData.ServerPayload",
        additional_form_data: { data: { sort: { str: { value: "sort_date" } } } },
      },
    },
    city_ids: [DIVAR_CONFIG.tabrizCityId],
  };
  if (input.page && input.page > 1) {
    payload.search_data = {
      ...(payload.search_data as Record<string, unknown>),
      pagination: {
        "@type": "type.googleapis.com/widgets.SearchData.Pagination",
        page: input.page,
        search_uid: input.searchUid ?? "",
        viewed_tokens: input.viewedTokens ?? "",
        last_post_date: input.lastPostDate ?? "",
      },
    };
  }

  const data = (await fetchJson(`${DIVAR_CONFIG.webApiBase}/v8/postlist/w/search`, {
    method: "POST",
    body: JSON.stringify(payload),
    headers: { Origin: DIVAR_CONFIG.webBase, Referer: `${DIVAR_CONFIG.webBase}/s/tabriz` },
  })) as WebSearchResponse;

  const rows: DivarSearchRow[] = [];
  for (const w of data.list_widgets ?? []) {
    if (w.widget_type !== "POST_ROW" || !w.data) continue;
    const d = w.data as {
      token?: string;
      title?: string;
      middle_description_text?: string;
      red_text?: string;
      image_count?: number;
      image_url?: string;
      top_description_text?: string;
    };
    if (!d.token) continue;
    rows.push({
      token: d.token,
      title: d.title ?? "",
      priceText: d.middle_description_text ?? null,
      redText: d.red_text ?? null,
      imageCount: d.image_count ?? 0,
      imageUrl: d.image_url ?? null,
      topText: d.top_description_text ?? null,
    });
  }
  const pag = data.pagination;
  return {
    rows,
    hasMore: Boolean(pag?.has_next_page),
    page: pag?.data?.page ?? input.page ?? 1,
    lastPostDate: pag?.data?.last_post_date ?? null,
    searchUid: pag?.data?.search_uid ?? null,
    viewedTokens: pag?.data?.viewed_tokens ?? null,
  };
}

// ===================== ۲) جزئیات آگهی (عمومی — بدون کلید) =====================

export interface DivarPostDetail {
  token: string;
  title: string;
  description: string | null;
  /** متن کامل «انتشار آگهی: ۱۹ شهریور ۱۴۰۵، ۱۴:۰۲» — زمان واقعی ایجاد */
  publishedText: string | null;
  lastBumpText: string | null;
  lastUpdateText: string | null;
  /** «۳ روز پیش در تبریز، خ نیکو ششم» */
  locationText: string | null;
  specs: { title: string; value: string }[];
  features: string[];
  priceTotalText: string | null;
  pricePerMeterText: string | null;
  images: string[];
  latitude: number | null;
  longitude: number | null;
  chatEnabled: boolean;
  city: string;
  category: string | null;
}

interface PostSection {
  section_name?: string;
  widgets?: { widget_type?: string; data?: Record<string, unknown> }[];
}

/** استخراج «۳ روز پیش در تبریز، خ …» از عنوان بخش EXPANDABLE */
function extractLocationAndTime(section: PostSection): { locationText: string | null; publishedText: string | null; bumpText: string | null; updateText: string | null } {
  let locationText: string | null = null;
  let publishedText: string | null = null;
  let bumpText: string | null = null;
  let updateText: string | null = null;
  for (const w of section.widgets ?? []) {
    if (w.widget_type === "EXPANDABLE_SECTION" && w.data) {
      const title = (w.data as { title?: string }).title;
      if (title && title.includes("پیش")) locationText = title;
      const wl = (w.data as { widget_list?: { widget_type?: string; data?: Record<string, unknown> }[] }).widget_list;
      for (const inner of wl ?? []) {
        if (inner.widget_type === "DESCRIPTION_ROW" && inner.data) {
          const text = (inner.data as { text?: string }).text;
          if (!text) continue;
          if (text.includes("انتشار آگهی:")) {
            const parts = text.split("\n");
            for (const p of parts) {
              if (p.includes("انتشار آگهی:")) publishedText = p.replace("انتشار آگهی:", "").trim();
              else if (p.includes("آخرین نردبان:")) bumpText = p.replace("آخرین نردبان:", "").trim();
              else if (p.includes("به‌روزرسانی:") || p.includes("به روزرسانی:")) updateText = p.replace(/آخرین به[-‌]?روزرسانی:/, "").trim();
            }
          }
        }
      }
    }
  }
  return { locationText, publishedText, bumpText, updateText };
}

export async function webGetPostDetail(token: string): Promise<DivarPostDetail> {
  const data = (await fetchJson(`${DIVAR_CONFIG.webApiBase}/v8/posts-v2/web/${encodeURIComponent(token)}`, {
    headers: { Referer: `${DIVAR_CONFIG.webBase}/v/${token}` },
  })) as {
    city?: { name?: string; city_id?: string };
    contact?: { chat_enabled?: boolean };
    sections?: PostSection[];
    analytics?: { cat3?: string };
    seo?: { title?: string };
  };

  const detail: DivarPostDetail = {
    token,
    title: "",
    description: null,
    publishedText: null,
    lastBumpText: null,
    lastUpdateText: null,
    locationText: null,
    specs: [],
    features: [],
    priceTotalText: null,
    pricePerMeterText: null,
    images: [],
    latitude: null,
    longitude: null,
    chatEnabled: Boolean(data.contact?.chat_enabled),
    city: data.city?.name ?? "تبریز",
    category: data.analytics?.cat3 ?? null,
  };

  for (const section of data.sections ?? []) {
    const name = section.section_name ?? "";
    if (name === "TITLE") {
      const lt = extractLocationAndTime(section);
      detail.locationText = lt.locationText;
      detail.publishedText = lt.publishedText;
      detail.lastBumpText = lt.bumpText;
      detail.lastUpdateText = lt.updateText;
      for (const w of section.widgets ?? []) {
        if (w.widget_type === "LEGEND_TITLE_ROW" && w.data) {
          detail.title = (w.data as { title?: string }).title ?? detail.title;
        }
      }
    } else if (name === "DESCRIPTION") {
      for (const w of section.widgets ?? []) {
        if (w.widget_type === "DESCRIPTION_ROW" && w.data) {
          const text = (w.data as { text?: string }).text;
          if (text && !detail.description) detail.description = text;
        }
      }
    } else if (name === "IMAGE") {
      for (const w of section.widgets ?? []) {
        if (w.widget_type === "IMAGE_CAROUSEL" && w.data) {
          const items = (w.data as { items?: { image?: { url?: string } }[] }).items ?? [];
          detail.images = items.map((i) => i.image?.url ?? "").filter(Boolean);
        }
      }
    } else if (name === "LIST_DATA") {
      for (const w of section.widgets ?? []) {
        const wt = w.widget_type;
        const d = w.data ?? {};
        if (wt === "GROUP_INFO_ROW") {
          const items = (d as { items?: { title?: string; value?: string }[] }).items ?? [];
          for (const it of items) {
            if (it.title && it.value != null) detail.specs.push({ title: it.title, value: String(it.value) });
          }
        } else if (wt === "UNEXPANDABLE_ROW") {
          const title = (d as { title?: string }).title;
          const value = (d as { value?: string }).value;
          if (title && value != null) detail.specs.push({ title, value: String(value) });
        } else if (wt === "GROUP_FEATURE_ROW" || wt === "GROUP_FEATURES_ROW") {
          const items = (d as { items?: { title?: string }[] }).items ?? [];
          for (const it of items) if (it.title) detail.features.push(it.title);
        }
      }
    } else if (name === "MAP") {
      for (const w of section.widgets ?? []) {
        if (w.widget_type === "MAP_ROW" && w.data) {
          const loc = (w.data as { location?: { exact_data?: { point?: { latitude?: number; longitude?: number } } } }).location;
          const pt = loc?.exact_data?.point;
          if (pt?.latitude != null && pt?.longitude != null) {
            detail.latitude = pt.latitude;
            detail.longitude = pt.longitude;
          }
        }
      }
    }
  }

  for (const s of detail.specs) {
    if (s.title.includes("قیمت کل")) detail.priceTotalText = s.value;
    else if (s.title.includes("قیمت هر متر")) detail.pricePerMeterText = s.value;
  }
  if (!detail.title && data.seo?.title) detail.title = data.seo.title.split(" در ")[0] ?? data.seo.title;
  return detail;
}

// ===================== ۳) کنار دیوار (رسمی — با کلید API) =====================

export interface KenarPost {
  token: string;
  category?: string;
  city?: string;
  district?: string;
  firstPublishedAt?: string;
  state?: string;
  chatEnabled?: boolean;
  isPhoneHidden?: boolean;
  businessName?: string | null;
  businessType?: string | null;
  data?: Record<string, unknown>;
}

/** جست‌وجوی کنار — POST /v2/open-platform/finder/post (دسترسی SEARCH_POST) */
export async function kenarSearch(apiKey: string, input: { city?: string; category?: string; page?: number }): Promise<{ posts: KenarPost[]; hasMore?: boolean }> {
  const body: Record<string, unknown> = {
    city: input.city ?? DIVAR_CONFIG.tabrizCitySlug,
  };
  if (input.category) body.category = input.category;
  if (input.page && input.page > 1) body.page = input.page;
  const data = (await fetchJson(`${DIVAR_CONFIG.kenarApiBase}/v2/open-platform/finder/post`, {
    method: "POST",
    headers: { "x-api-key": apiKey },
    body: JSON.stringify(body),
  })) as { posts?: KenarPost[]; has_more?: boolean; next_page_token?: string };
  return { posts: data.posts ?? [], hasMore: Boolean(data.has_more ?? data.next_page_token) };
}

/** دریافت آگهی از کنار — GET /v1/open-platform/finder/post/:token (دسترسی GET_POST) */
export async function kenarGetPost(apiKey: string, token: string): Promise<KenarPost> {
  return (await fetchJson(`${DIVAR_CONFIG.kenarApiBase}/v1/open-platform/finder/post/${encodeURIComponent(token)}`, {
    headers: { "x-api-key": apiKey },
  })) as KenarPost;
}

/** آزمون کلید کنار — GET /v1/open-platform/assets/city (عمومی) + finder با کلید */
export async function kenarTestKey(apiKey: string): Promise<{ ok: boolean; message: string }> {
  try {
    await fetchJson(`${DIVAR_CONFIG.kenarApiBase}/v1/open-platform/finder/post/${"test"}`, {
      headers: { "x-api-key": apiKey },
      retries: 0,
      timeoutMs: 12000,
    });
    return { ok: true, message: "کلید کنار معتبر است." };
  } catch (err) {
    const e = err as DivarApiError;
    if (e.status === 403 && String(e.message).includes("Invalid api-key")) {
      return { ok: false, message: "کلید API کنار نامعتبر است — مقدار کلید را دقیق بررسی کنید." };
    }
    if (e.status === 403 && String(e.message).includes("RBAC")) {
      return { ok: false, message: "کلید به مسیر کنار دسترسی ندارد — دسترسی GET_POST/SEARCH_POST را در پنل کنار فعال کنید." };
    }
    return { ok: false, message: e.message ?? "آزمون کلید ناموفق بود." };
  }
}

// ===================== ۴) ورود پیامکی دیوار (اکانت کاربر) =====================

/**
 * گام ۱ — درخواست کد پیامکی دیوار برای شماره موبایل کاربر.
 * POST /v8/auth/authenticate {phone} → «کد تایید به این شماره پیامک می شود»
 * (زنده تست‌شده؛ پاسخ: AUTHENTICATION_VERIFICATION_CODE_SENT)
 */
export async function divarSendOtp(phone: string): Promise<{ sent: boolean; response?: string }> {
  const data = (await fetchJson(`${DIVAR_CONFIG.webApiBase}/v8/auth/authenticate`, {
    method: "POST",
    body: JSON.stringify({ phone }),
    headers: { Origin: DIVAR_CONFIG.webBase, Referer: `${DIVAR_CONFIG.webBase}/s/tabriz` },
  })) as { authenticate_response?: string };
  return { sent: true, response: data?.authenticate_response ?? "AUTHENTICATION_VERIFICATION_CODE_SENT" };
}

/**
 * گام ۲ — تأیید کد پیامکی و دریافت توکن نشست دیوار.
 * POST /v8/auth/confirm {phone, code} → {data:{token}}
 * (نقشه دقیق از باندل رسمی وب دیوار استخراج شد)
 */
export async function divarVerifyCode(phone: string, code: string): Promise<{ token: string }> {
  const data = (await fetchJson(`${DIVAR_CONFIG.webApiBase}/v8/auth/confirm`, {
    method: "POST",
    body: JSON.stringify({ phone, code }),
    headers: { Origin: DIVAR_CONFIG.webBase, Referer: `${DIVAR_CONFIG.webBase}/s/tabriz` },
  })) as { token?: string; data?: { token?: string } };
  const token = data?.token ?? data?.data?.token;
  if (!token) throw new DivarApiError("OTP_INVALID", "کد تأیید دیوار نادرست یا منقضی است.", 401, false);
  return { token };
}

/** نشانی پل به آگهی در وب دیوار */
export function divarPostUrl(token: string, title?: string | null): string {
  const slug = (title ?? "ملک").replace(/\s+/g, "-").slice(0, 60);
  return `${DIVAR_CONFIG.webBase}/v/${encodeURIComponent(slug)}/${token}`;
}
