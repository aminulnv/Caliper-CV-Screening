/** Flip to true after pgvector is enabled and migrate-cv-embeddings has run. */
export const semanticCvSearchEnabled =
  process.env.SEMANTIC_CV_SEARCH_ENABLED === 'true';
