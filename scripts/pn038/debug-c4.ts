// Debug: what does armCall throw in relay mode with offline flag now?
process.env.DATABASE_URL = "file:/home/z/my-project/db/test.db";
process.env.MELK_TOKEN_KEY = "test-only-key-not-a-real-secret";
process.env.MELK_ARM_RELAY_MODE = "mobile";
process.env.MELK_ARM_OFFLINE = "1";

async function main() {
  const { armCall } = await import("/home/z/my-project/src/lib/melk-api/client");
  try {
    const r = await armCall({ path: "x", baseUrl: "https://arus-api.melketabriz.ir/api/apm/", timeoutMs: 200, maxRetries: 0 } as any);
    console.log("RESOLVED:", JSON.stringify(r).slice(0, 100));
  } catch (e: any) {
    console.log("THREW:", "name=" + e.name, "code=" + e.code, "msg=" + String(e.message).slice(0, 80));
  }
  process.exit(0);
}
main();
