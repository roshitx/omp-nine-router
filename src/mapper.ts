/**
 * Slug → OMP canonical ID fuzzy matcher.
 *
 * Two catalog sources, tried in order:
 * 1. Live OMP catalog (passed via setLiveCatalog)
 * 2. Static fallback catalog (KNOWN_MODELS)
 *
 * Match strategy, applied per candidate, then best overall picked:
 * 1. Exact normalized canonical ID match
 * 2. Exact alias match
 * 3. Substring containment (bi-directional, length ratio as tiebreaker)
 * 4. Word-token Jaccard overlap ≥ 0.5
 */
import type { CatalogMatch, LiveModel, OmpModelMetadata } from "./types";

// ─── Live catalog injection ────────────────────────────────────────

let liveModels: LiveModel[] = [];

export function setLiveCatalog(models: LiveModel[]): void {
  liveModels = models;
}

// ─── Static fallback catalog ───────────────────────────────────────

interface KnownModel {
  canonicalId: string;
  provider: string;
  contextWindow: number;
  maxTokens: number;
  input: string[];
  reasoning: boolean;
  thinking?: string[];
  api: string;
  cost: OmpModelMetadata["cost"];
  aliases: string[];
}

const KNOWN_MODELS: KnownModel[] = [
  {
    canonicalId: "claude-opus-4-5",
    provider: "anthropic",
    api: "anthropic-messages",
    contextWindow: 200_000,
    maxTokens: 32_768,
    input: ["text", "image"],
    reasoning: true,
    thinking: ["minimal", "low", "medium", "high"],
    cost: { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
    aliases: ["claude-opus-4.5"],
  },
  {
    canonicalId: "claude-sonnet-4-5",
    provider: "anthropic",
    api: "anthropic-messages",
    contextWindow: 200_000,
    maxTokens: 16_384,
    input: ["text", "image"],
    reasoning: true,
    thinking: ["minimal", "low", "medium", "high"],
    cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
    aliases: ["claude-sonnet-4.5", "sonnet-4.5", "sonnet-4-5"],
  },
  {
    canonicalId: "claude-haiku-4-5",
    provider: "anthropic",
    api: "anthropic-messages",
    contextWindow: 200_000,
    maxTokens: 8_192,
    input: ["text", "image"],
    reasoning: false,
    cost: { input: 0.8, output: 4, cacheRead: 0.08, cacheWrite: 1 },
    aliases: ["claude-haiku-4.5"],
  },
  {
    canonicalId: "claude-sonnet-4",
    provider: "anthropic",
    api: "anthropic-messages",
    contextWindow: 200_000,
    maxTokens: 16_384,
    input: ["text", "image"],
    reasoning: true,
    thinking: ["minimal", "low", "medium", "high"],
    cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
    aliases: ["claude-sonnet-4", "sonnet-4"],
  },
  {
    canonicalId: "claude-opus-4",
    provider: "anthropic",
    api: "anthropic-messages",
    contextWindow: 200_000,
    maxTokens: 32_768,
    input: ["text", "image"],
    reasoning: true,
    thinking: ["minimal", "low", "medium", "high"],
    cost: { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
    aliases: ["claude-opus-4"],
  },
  {
    canonicalId: "gpt-5.5",
    provider: "openai-codex",
    api: "openai-completions",
    contextWindow: 200_000,
    maxTokens: 32_768,
    input: ["text", "image"],
    reasoning: true,
    thinking: ["low", "medium", "high", "xhigh"],
    cost: { input: 2.5, output: 10, cacheRead: 0.625, cacheWrite: 2.5 },
    aliases: ["gpt-5-5"],
  },
  {
    canonicalId: "gpt-5.4",
    provider: "openai-codex",
    api: "openai-completions",
    contextWindow: 200_000,
    maxTokens: 32_768,
    input: ["text", "image"],
    reasoning: true,
    thinking: ["low", "medium", "high", "xhigh"],
    cost: { input: 2.5, output: 10, cacheRead: 0.625, cacheWrite: 2.5 },
    aliases: ["gpt-5-4"],
  },
  {
    canonicalId: "gpt-5.3-codex",
    provider: "openai-codex",
    api: "openai-completions",
    contextWindow: 128_000,
    maxTokens: 32_768,
    input: ["text"],
    reasoning: true,
    thinking: ["low", "medium", "high", "xhigh"],
    cost: { input: 1.25, output: 5, cacheRead: 0.3125, cacheWrite: 1.25 },
    aliases: ["gpt-5-3-codex", "gpt-5.3"],
  },
  {
    canonicalId: "gpt-5.4-mini",
    provider: "openai-codex",
    api: "openai-completions",
    contextWindow: 128_000,
    maxTokens: 32_768,
    input: ["text"],
    reasoning: true,
    thinking: ["low", "medium", "high", "xhigh"],
    cost: { input: 0.6, output: 2.4, cacheRead: 0.15, cacheWrite: 0.6 },
    aliases: ["gpt-5-4-mini"],
  },
  {
    canonicalId: "deepseek-v4",
    provider: "deepseek",
    api: "openai-completions",
    contextWindow: 128_000,
    maxTokens: 32_768,
    input: ["text"],
    reasoning: true,
    thinking: ["minimal", "low", "medium", "high", "xhigh"],
    cost: { input: 0.55, output: 2.19, cacheRead: 0.14, cacheWrite: 0.55 },
    aliases: ["deepseek-v4-flash", "deepseek-v4-flash-free"],
  },
  {
    canonicalId: "deepseek-reasoner",
    provider: "deepseek",
    api: "openai-completions",
    contextWindow: 64_000,
    maxTokens: 8_192,
    input: ["text"],
    reasoning: true,
    thinking: ["minimal", "low", "medium", "high", "xhigh"],
    cost: { input: 0.55, output: 2.19, cacheRead: 0.14, cacheWrite: 0.55 },
    aliases: ["deepseek-r1"],
  },
  {
    canonicalId: "deepseek-chat",
    provider: "deepseek",
    api: "openai-completions",
    contextWindow: 64_000,
    maxTokens: 8_192,
    input: ["text"],
    reasoning: false,
    cost: { input: 0.27, output: 1.1, cacheRead: 0.07, cacheWrite: 0.27 },
    aliases: ["deepseek-v3"],
  },
  {
    canonicalId: "gemini-2.5-pro",
    provider: "google",
    api: "openai-completions",
    contextWindow: 1_048_576,
    maxTokens: 65_536,
    input: ["text", "image"],
    reasoning: true,
    thinking: ["minimal", "low", "medium", "high"],
    cost: { input: 1.25, output: 10, cacheRead: 0.3125, cacheWrite: 1.25 },
    aliases: ["gemini-2-5-pro"],
  },
  {
    canonicalId: "gemini-2.5-flash",
    provider: "google",
    api: "openai-completions",
    contextWindow: 1_048_576,
    maxTokens: 8_192,
    input: ["text", "image"],
    reasoning: true,
    thinking: ["minimal", "low", "medium", "high"],
    cost: { input: 0.15, output: 0.6 },
    aliases: ["gemini-2-5-flash"],
  },
  {
    canonicalId: "grok-4",
    provider: "grok",
    api: "openai-completions",
    contextWindow: 1_000_000,
    maxTokens: 32_768,
    input: ["text", "image"],
    reasoning: true,
    thinking: ["low", "medium", "high", "xhigh"],
    cost: { input: 2, output: 8 },
    aliases: [],
  },
  {
    canonicalId: "qwen3-coder",
    provider: "qwen",
    api: "openai-completions",
    contextWindow: 128_000,
    maxTokens: 8_192,
    input: ["text"],
    reasoning: true,
    thinking: ["minimal", "low", "medium", "high"],
    cost: { input: 0.2, output: 0.8 },
    aliases: ["qwen-3-coder"],
  },
];

// ─── Slug parsing ──────────────────────────────────────────────────

export function parseSlug(slug: string): { prefix: string; model: string } {
  const slash = slug.indexOf("/");
  if (slash === -1) return { prefix: "", model: slug };
  return { prefix: slug.slice(0, slash), model: slug.slice(slash + 1) };
}

// ─── Normalization ─────────────────────────────────────────────────

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/\./g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function tokenSet(s: string): Set<string> {
  return new Set(norm(s).split("-").filter(Boolean));
}

// ─── Confidence ranking ────────────────────────────────────────────

const RANK_BY_CONFIDENCE: Record<string, number> = { exact: 4, high: 3, medium: 2, low: 1 };

function betterThan(a: MatchResult, b: MatchResult): boolean {
  const ra = RANK_BY_CONFIDENCE[a.match.confidence] ?? 0;
  const rb = RANK_BY_CONFIDENCE[b.match.confidence] ?? 0;
  return ra > rb || (ra === rb && a.score > b.score);
}

// ─── Unified match entry point ─────────────────────────────────────

/**
 * Match a model name (without provider prefix) against live OMP
 * catalog first, then static fallback. Returns best match or null.
 */
export function matchModel(modelName: string): CatalogMatch | null {
  return matchAgainstLive(modelName) ?? matchAgainstStatic(modelName);
}

// ─── Candidate matching (live → static, best-first) ────────────────

interface CatalogCandidate {
  canonicalId: string;
  provider: string;
  aliases: string[];
  metadata: OmpModelMetadata;
}

interface MatchResult {
  match: CatalogMatch;
  score: number; // numeric tiebreaker within same confidence
}

function matchAgainstLive(modelName: string): CatalogMatch | null {
  if (liveModels.length === 0) return null;
  return bestMatch(liveModels.map(toCatalogCandidate), modelName);
}

function matchAgainstStatic(modelName: string): CatalogMatch | null {
  const candidates = KNOWN_MODELS.map((km) => ({
    canonicalId: km.canonicalId,
    provider: km.provider,
    aliases: km.aliases,
    metadata: {
      contextWindow: km.contextWindow,
      maxTokens: km.maxTokens,
      input: km.input,
      reasoning: km.reasoning,
      cost: km.cost,
    },
  }));
  return bestMatch(candidates, modelName);
}

function bestMatch(candidates: CatalogCandidate[], modelName: string): CatalogMatch | null {
  const target = norm(modelName);
  let best: MatchResult | null = null;
  for (const c of candidates) {
    const result = tryMatch(c, target);
    if (result && (!best || betterThan(result, best))) {
      best = result;
    }
  }
  return best?.match ?? null;
}

// ─── Single-candidate match ────────────────────────────────────────

function tryMatch(c: CatalogCandidate, target: string): MatchResult | null {
  // Level 1: exact canonical
  if (norm(c.canonicalId) === target) {
    return { match: build(c, "exact"), score: 1 };
  }
  // Level 2: exact alias
  for (const alias of c.aliases) {
    if (norm(alias) === target) {
      return { match: build(c, "high"), score: 1 };
    }
  }
  // Level 3: substring (bi-directional)
  const cn = norm(c.canonicalId);
  if (target.includes(cn) || cn.includes(target)) {
    return { match: build(c, "medium"), score: lengthRatio(target, cn) };
  }
  for (const alias of c.aliases) {
    const an = norm(alias);
    if (target.includes(an) || an.includes(target)) {
      return { match: build(c, "medium"), score: lengthRatio(target, an) };
    }
  }
  // Level 4: token Jaccard overlap
  const inputTokens = tokenSet(target);
  if (inputTokens.size === 0) return null;
  const allText = [c.canonicalId, ...c.aliases].map(norm).join(" ");
  const targetTokens = tokenSet(allText);
  const intersection = [...inputTokens].filter((t) => targetTokens.has(t)).length;
  const union = new Set([...inputTokens, ...targetTokens]).size;
  const jaccard = intersection / union;
  if (jaccard >= 0.5) return { match: build(c, "low"), score: jaccard };
  return null;
}

function lengthRatio(a: string, b: string): number {
  return Math.min(a.length, b.length) / Math.max(a.length, b.length);
}

function build(c: CatalogCandidate, confidence: CatalogMatch["confidence"]): CatalogMatch {
  return {
    canonicalId: c.canonicalId,
    provider: c.provider,
    confidence,
    metadata: {
      ...c.metadata,
      input: [...c.metadata.input],
      cost: c.metadata.cost ? { ...c.metadata.cost } : undefined,
    },
  };
}

function toCatalogCandidate(lm: LiveModel): CatalogCandidate {
  return {
    canonicalId: lm.id,
    provider: lm.provider,
    aliases: lm.name ? [lm.name] : [],
    metadata: {
      name: lm.name,
      contextWindow: lm.contextWindow,
      maxTokens: lm.maxTokens,
      input: lm.input ?? ["text"],
      reasoning: lm.reasoning,
      cost: lm.cost,
    },
  };
}
