import { matchModel, parseSlug } from "./mapper";
import { parseModelsYml } from "./modelsYmlParser";
/**
 * Enrichment pipeline: raw 9Router models → enriched entries.
 *
 * Priority per field:
 * 1. 9Router raw metadata (context_length, max_tokens, pricing)
 * 2. User's ~/.omp/agent/models.yml (exact ID match — hand-curated)
 * 3. OMP catalog match (static or live) — fill gaps: reasoning, input modality
 * 4. Heuristic defaults
 */
import type { CatalogMatch, EnrichedModel, LiveModel, NineRouterModel } from "./types";

const HEURISTIC = {
  contextWindow: 128_000,
  maxTokens: 16_384,
  input: ["text"] as string[],
  reasoning: false,
  api: "openai-completions",
};
const HEURISTIC_THINKING: string[] = ["minimal", "low", "medium", "high"];

export interface EnrichResult {
  enriched: EnrichedModel[];
  stats: {
    total: number;
    from9Router: number;
    fromUserYml: number;
    fromCatalog: number;
    heuristicOnly: number;
    skipped: number;
    errors: string[];
  };
}

let userYmlCache: Map<string, LiveModel> | null = null;

export function enrichModels(
  rawModels: NineRouterModel[],
  config?: { excludeModels?: string[]; includeModels?: string[]; includeOnly?: boolean },
): EnrichResult {
  const userIndex = resolveUserIndex();
  const enriched: EnrichedModel[] = [];
  const errors: string[] = [];
  let from9Router = 0;
  let fromUserYml = 0;
  let fromCatalog = 0;
  let heuristicOnly = 0;
  let skipped = 0;

  for (const raw of rawModels) {
    if (!raw.id || typeof raw.id !== "string") {
      skipped++;
      continue;
    }

    const { prefix, model: modelName } = parseSlug(raw.id);
    const catalogMatch = matchModel(modelName);
    const userEntry = userIndex.get(raw.id);

    const contextWindow =
      raw.context_length ?? userEntry?.contextWindow ?? catalogMatch?.metadata.contextWindow ?? HEURISTIC.contextWindow;

    const maxTokens = raw.max_tokens ?? userEntry?.maxTokens ?? catalogMatch?.metadata.maxTokens ?? HEURISTIC.maxTokens;

    const selectedInput = userEntry?.input?.length
      ? userEntry.input
      : catalogMatch?.metadata.input?.length
        ? catalogMatch.metadata.input
        : HEURISTIC.input;
    const input = normalizeInput(selectedInput);

    const reasoning = userEntry?.reasoning ?? catalogMatch?.metadata.reasoning ?? HEURISTIC.reasoning;

    const thinking =
      userEntry?.thinking ?? catalogMatch?.metadata.thinking ?? (reasoning ? HEURISTIC_THINKING : undefined);

    const api = userEntry?.api ?? catalogMatch?.metadata.api ?? HEURISTIC.api;

    const cost = {
      input: raw.pricing?.prompt ?? userEntry?.cost?.input ?? catalogMatch?.metadata.cost?.input ?? 0,
      output: raw.pricing?.completion ?? userEntry?.cost?.output ?? catalogMatch?.metadata.cost?.output ?? 0,
      thinking: undefined,
      cacheRead: catalogMatch?.metadata.cost?.cacheRead ?? 0,
      cacheWrite: catalogMatch?.metadata.cost?.cacheWrite ?? 0,
    };

    const has9Router = !!(raw.context_length || raw.max_tokens || raw.pricing);
    const hasUser = !!userEntry;
    const hasCatalog = !!catalogMatch;

    let source: EnrichedModel["enrichmentSource"];
    if (has9Router) {
      source = "9router-metadata";
      from9Router++;
    } else if (hasUser) {
      source = "user-models-yml";
      fromUserYml++;
    } else if (hasCatalog) {
      source = "omp-catalog";
      fromCatalog++;
    } else {
      source = "heuristic";
      heuristicOnly++;
    }

    const name = userEntry?.name ?? catalogMatch?.metadata.name ?? modelName;
    const displayName = prefix ? `${name} (${prefix})` : name;

    enriched.push({
      id: raw.id,
      name: displayName,
      canonicalId: catalogMatch?.canonicalId,
      enrichmentSource: source,
      contextWindow,
      maxTokens,
      input,
      reasoning,
      thinking,
      api,
      cost,
    });
  }

  // Apply exclude/include filters
  const filtered = applyModelFilters(enriched, config);

  return {
    enriched: filtered,
    stats: { total: rawModels.length, from9Router, fromUserYml, fromCatalog, heuristicOnly, skipped, errors },
  };
}

/** Wildcard-match a pattern against a string (supports * and ?). */
function wildcardMatch(pattern: string, value: string): boolean {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&") // escape regex specials
    .replace(/\*/g, ".*") // * → .*
    .replace(/\?/g, "."); // ? → .
  return new RegExp(`^${escaped}$`).test(value);
}

function applyModelFilters(
  models: EnrichedModel[],
  config?: { excludeModels?: string[]; includeModels?: string[]; includeOnly?: boolean },
): EnrichedModel[] {
  if (!config) return models;
  const { excludeModels, includeModels, includeOnly } = config;
  if (!excludeModels?.length && !includeModels?.length) return models;

  return models.filter((m) => {
    // includeModels with includeOnly: reject non-matching
    if (includeModels?.length && includeOnly) {
      const matched = includeModels.some((p) => wildcardMatch(p, m.id));
      if (!matched) return false;
    }
    // excludeModels: reject matching
    if (excludeModels?.length) {
      const matched = excludeModels.some((p) => wildcardMatch(p, m.id));
      if (matched) return false;
    }
    return true;
  });
}

function resolveUserIndex(): Map<string, LiveModel> {
  if (userYmlCache) return userYmlCache;
  userYmlCache = new Map();
  try {
    const home = process.env.HOME || "/tmp";
    for (const m of parseModelsYml(`${home}/.omp/agent/models.yml`)) {
      if (m.id) userYmlCache.set(m.id, m);
    }
  } catch {
    /* silent */
  }
  return userYmlCache;
}

function normalizeInput(input: string[]): ("text" | "image")[] {
  const supported = input.filter((item) => item === "text" || item === "image");
  return supported.length > 0 ? (Array.from(new Set(supported)) as ("text" | "image")[]) : ["text"];
}
