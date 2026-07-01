/**
 * 9Router Sync Extension — shared types.
 *
 * Models the 9Router /v1/models response, enriched model entries,
 * and the generated YAML block written to a sidecar file.
 */

// ─── 9Router wire types ────────────────────────────────────────────

/** Raw model entry from 9Router /v1/models response. */
export interface NineRouterModel {
  id: string; // e.g. "kr/claude-sonnet-4.5"
  object?: string;
  created?: number;
  owned_by?: string;
  context_length?: number;
  max_tokens?: number;
  pricing?: { prompt?: number; completion?: number };
  [key: string]: unknown;
}

/** OpenAI-style list response. */
export interface NineRouterModelsResponse {
  object?: "list";
  data: NineRouterModel[];
}

// ─── Enrichment types ──────────────────────────────────────────────

export interface CatalogMatch {
  canonicalId: string; // e.g. "claude-sonnet-4-5"
  provider: string; // e.g. "anthropic"
  confidence: "exact" | "high" | "medium" | "low";
  metadata: OmpModelMetadata;
}

export interface OmpModelMetadata {
  name?: string;
  contextWindow?: number;
  maxTokens?: number;
  input: string[];
  reasoning?: boolean;
  thinking?: string[];
  api?: string;
  cost?: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number };
}

export interface EnrichedModel {
  id: string;
  name: string;
  canonicalId?: string;
  enrichmentSource: "omp-catalog" | "9router-metadata" | "user-models-yml" | "heuristic";
  contextWindow: number;
  maxTokens: number;
  input: ("text" | "image")[];
  reasoning: boolean;
  thinking?: string[];
  api: string;
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
}

/** Shape of a live OMP model — from ctx.modelRegistry.getAll(). */
export interface LiveModel {
  id: string;
  provider: string;
  name?: string;
  contextWindow?: number;
  maxTokens?: number;
  reasoning?: boolean;
  thinking?: string[];
  api?: string;
  input?: string[];
  cost?: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number };
}
export interface NineRouterConfig {
  baseUrl: string;
  apiKey: string;
  providerId: string;
  modelsYmlPath?: string;
  outputPath?: string; // sidecar output (default: ~/.omp/agent/nine-router.generated.yml)
  excludeModels?: string[]; // glob patterns (e.g. ['openai/gpt-3.5*', '*/free-*'])
  includeModels?: string[]; // glob patterns (if specified, only these are included)
  includeOnly?: boolean; // if true, exclude all not in includeModels
}

// ─── Generate result ───────────────────────────────────────────────

export interface GenerateResult {
  modelsFound: number;
  enriched: number;
  heuristicDefaults: number;
  skipped: number;
  errors: string[];
  yamlBlock: string;
  outputPath: string;
}
