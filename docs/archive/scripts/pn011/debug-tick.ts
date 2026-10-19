/** دیباگ: چرا تست ۲-۵ شکست می‌خورد — ticks قبل/بعد تیک مصنوعی */
import { catalogDaemonTick, catalogDaemonStatus } from "@/lib/melk-api/catalog-daemon";

const fakeDb = {
  session: {
    findFirst: async () => null,
  },
} as never;

const before = catalogDaemonStatus();
console.log("BEFORE:", JSON.stringify(before, null, 2));
const after = await catalogDaemonTick(fakeDb);
console.log("AFTER:", JSON.stringify(after, null, 2));
