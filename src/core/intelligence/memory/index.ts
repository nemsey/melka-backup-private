/**
 * صادرات واحد ماژول حافظه — PHASE 4 (بدنه موتور Memory)
 * ------------------------------------------------------
 * قرارداد v1 در ../engines/memory.ts دست‌نخورده است؛ این‌جا فقط بدنه‌ها.
 */

export {
  InMemoryStore,
  FileSystemStore,
  applyMemoryQuery,
  type MemoryRecord,
  type MemoryStore,
  type MemoryStoreQuery,
} from "./memory-store";

export {
  VectorIndex,
  embedText,
  tokenizeText,
  cosineSimilarity,
  type EmbedFn,
  type VectorHit,
  type VectorIndexOptions,
} from "./vector-index";

export {
  MemoryEngineImpl,
  createMemoryEngine,
  type MemoryEngineOptions,
  type SimilarMemoryHit,
  type ConsolidateOptions,
  type ConsolidationGroup,
  type ConsolidationReport,
  type MemoryEngineStats,
} from "./memory-engine";
