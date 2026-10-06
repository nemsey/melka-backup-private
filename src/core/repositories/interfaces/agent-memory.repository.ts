/**
 * AgentMemoryRepository — قرارداد دسترسی به حافظه و بازخورد ایجنت‌ها
 * ------------------------------------------------------
 * دامنه: AgentMemory (فقط افزودنی) + AgentFeedback (فقط افزودنی).
 * مصرف‌کننده‌ها: BaseLearningAgent (تمام ایجنت‌ها)، روت divar/ads/[token]/reject.
 */
import type { AgentFeedbackDTO, AgentFeedbackInput, AgentMemoryDTO } from "./dto";

export interface AgentMemoryRepository {
  /** ثبت قطعه حافظه — فقط افزودنی، هرگز بازنویسی نمی‌شود */
  append(tileId: string, kind: string, payloadJson: string): Promise<void>;
  /** حافظه‌های اخیر یک کاشی — مرتب بر اساس createdAt نزولی */
  listRecent(tileId: string, take: number): Promise<AgentMemoryDTO[]>;
  /** بازخوردهای اخیر یک کاشی — مرتب بر اساس createdAt نزولی */
  listFeedbacks(tileId: string, take: number): Promise<AgentFeedbackDTO[]>;
  /** همه بازخوردهای یک کاشی (بازبینی سیاست) */
  listAllFeedbacks(tileId: string): Promise<AgentFeedbackDTO[]>;
  /** ثبت بازخورد کاربر روی بینش — فقط افزودنی */
  createFeedback(input: AgentFeedbackInput): Promise<void>;
  /** شمارش حافظه‌های یک کاشی */
  countMemory(tileId: string): Promise<number>;
  /** شمارش بازخوردهای یک کاشی (اختیاری: فقط مثبت) */
  countFeedback(tileId: string, positiveOnly?: boolean): Promise<number>;
}
