/**
 * واکشی مسیر lazy کسب‌وکار آگهی‌های مشاور: /v8/premium-user/post-page/business-data/{token}/lazy
 * هدف: ساختار دقیق نام و نوع (مشاور املاک / دپارتمان املاک)
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

async function j(url: string, init?: RequestInit): Promise<any> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "User-Agent": UA,
      "Accept": "application/json, text/plain, */*",
      ...(init?.headers ?? {}),
    },
  });
  const t = await res.text();
  try {
    return { status: res.status, data: t ? JSON.parse(t) : null };
  } catch {
    return { status: res.status, data: t };
  }
}

async function main() {
  const tokens = process.argv.slice(2);
  for (const token of tokens) {
    const { status, data } = await j(
      `https://api.divar.ir/v8/premium-user/post-page/business-data/${token}/lazy`,
      { headers: { Referer: `https://divar.ir/v/${token}` } }
    );
    console.log(`\n===== ${token} (HTTP ${status}) =====`);
    console.log(JSON.stringify(data, null, 1).slice(0, 4000));
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
