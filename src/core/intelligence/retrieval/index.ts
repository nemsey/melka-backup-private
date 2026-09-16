/**
 * صادرات واحد ماژول بازیابی — PHASE 5 (بدنه موتور Retrieval)
 * ------------------------------------------------------
 * قرارداد v1 در ../engines/retrieval.ts دست‌نخورده است؛ این‌جا بدنه‌ها.
 * ماژول‌ها به‌ترتیب ساخت: metadata (P5-02) → keyword-search (P5-03) →
 * hybrid-retriever (P5-04) → reranker (P5-05) → citation-builder (P5-06) →
 * retrieval-engine (P5-07 — بدنه قرارداد v1).
 */

export {
  resolveMetadata,
  normalizeForMatch,
  matchesMetadataFilter,
  applyMetadataFilter,
  type MemoryMetadata,
  type MemorySource,
  type MetadataFilter,
  type MetadataHost,
} from "./metadata";

export {
  KeywordSearch,
  normalizePersian,
  tokenizeDual,
  PERSIAN_STOPWORDS,
  type BM25Options,
  type DualTokens,
  type KeywordHit,
} from "./keyword-search";

export {
  HybridRetriever,
  createHybridRetriever,
  type VectorSearchFn,
  type HybridQuery,
  type HybridOptions,
  type RetrievedItem,
  type RetrievalSource,
  type HybridRetrieverDeps,
  type HybridRetrieverHandle,
  type CreateHybridRetrieverOptions,
} from "./hybrid-retriever";
