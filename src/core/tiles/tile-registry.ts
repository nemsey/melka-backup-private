/**
 * رجیستری کاشی‌ها (Tile Registry) — هسته مدیریت پلاگین
 * ------------------------------------------------------
 * ثبت، بازیابی، فهرست‌بندی و حذف پویا کاشی‌ها.
 * ایزوله‌سازی خطا: خطای یک کاشی بقیه را از کار نمی‌اندازد.
 */

import type { TileDefinition } from "./tile-contract";

class TileRegistry {
  private tiles = new Map<string, TileDefinition>();

  /** ثبت کاشی جدید — شناسه تکراری خطا می‌دهد (جلوگیری از تعارض پلاگین‌ها) */
  register(def: TileDefinition): void {
    if (this.tiles.has(def.id)) {
      throw new Error(`کاشی با شناسه «${def.id}» قبلاً ثبت شده است.`);
    }
    this.tiles.set(def.id, def);
  }

  /** حذف کاشی — بدون آسیب به بقیه */
  unregister(id: string): boolean {
    return this.tiles.delete(id);
  }

  get(id: string): TileDefinition | undefined {
    return this.tiles.get(id);
  }

  /** همه کاشی‌ها با ترتیب نمایش، فیلترشده بر اساس نقش */
  listAll(role: "OWNER" | "CONSULTANT"): TileDefinition[] {
    return [...this.tiles.values()]
      .filter((t) => !t.minRole || t.minRole === "OWNER")
      .filter((t) => (t.minRole === "OWNER" ? role === "OWNER" : true))
      .sort((a, b) => a.order - b.order);
  }

  has(id: string): boolean {
    return this.tiles.has(id);
  }

  get size(): number {
    return this.tiles.size;
  }
}

/** نمونه یکتای رجیستری (پلاگین‌ها در همان import ثبت می‌شوند) */
export const tileRegistry = new TileRegistry();
