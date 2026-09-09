import { matchModel, parseSlug } from "./mapper";
import { parseModelsYml } from "./modelsYmlParser";
import { humanizeModelName, isRawSlugName } from "./names";
/**
 * Enrichment pipeline: raw 9Router models → enriched entries.
 *
 * Priority per field:
 * 1. 9Router raw metadata (context_length, max_tokens, pricing) when present
 * 2. Static/live catalog match (real context windows + pretty names)
 * 3. User's ~/.omp/agent/models.yml ONLY when values look curated
 *    (not the old 128k heuristic pollution / raw slug names)
 * 4. Humanized slug + heuristic defaults
 */
import type { EnrichedModel, LiveModel, NineRouterModel } from "./types";

const HEURISTIC = {
  contextWindow: 128_000,
  maxTokens: 16_384,
  input: ["text"] as string[],
  reasoning: false,
  api: "openai-completions",
};
const HEURISTIC_THINKING: string[] = ["minimal", "low", "medium", "high"];

/** Values previously written by this tool as defaults — never treat as curated. */
function isHeuristicContext(n: number | undefined): boolean {
  return n === undefined || n === HEURISTIC.contextWindow;
}
function isHeuristicMaxTokens(n: number | undefined): boolean {
  return n === undefined || n === HEURISTIC.maxTokens;
}

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
    const meta = catalogMatch?.metadata;
    const hasCommandCodeMetadata = prefix === "cmc" && raw.command_code_metadata === true;
    const preferCatalog =
      prefix === "cmc" &&
      !hasCommandCodeMetadata &&
      (catalogMatch?.confidence === "exact" || catalogMatch?.confidence === "high");
    // Live CommandCode metadata → exact/high catalog → 9Router → curated user yml → heuristic.
    const contextWindow =
      (hasCommandCodeMetadata ? raw.context_length : undefined) ??
      (preferCatalog ? meta?.contextWindow : undefined) ??
      raw.context_length ??
      meta?.contextWindow ??
      (!isHeuristicContext(userEntry?.contextWindow) ? userEntry?.contextWindow : undefined) ??
      HEURISTIC.contextWindow;

    const maxTokens =
      (hasCommandCodeMetadata ? raw.max_tokens : undefined) ??
      (preferCatalog ? meta?.maxTokens : undefined) ??
      raw.max_tokens ??
      meta?.maxTokens ??
      (!isHeuristicMaxTokens(userEntry?.maxTokens) ? userEntry?.maxTokens : undefined) ??
      HEURISTIC.maxTokens;

    const selectedInput = meta?.input?.length
      ? meta.input
      : userEntry?.input?.length
        ? userEntry.input
        : HEURISTIC.input;
    const input = normalizeInput(selectedInput);

    const reasoning = meta?.reasoning ?? userEntry?.reasoning ?? HEURISTIC.reasoning;

    const thinking =
      meta?.thinking ?? userEntry?.thinking ?? (reasoning ? HEURISTIC_THINKING : undefined);
    const api = meta?.api ?? userEntry?.api ?? HEURISTIC.api;


    const cost = {
      input:
        (hasCommandCodeMetadata ? raw.pricing?.prompt : undefined) ??
        (preferCatalog ? meta?.cost?.input : undefined) ??
        raw.pricing?.prompt ??
        meta?.cost?.input ??
        userEntry?.cost?.input ??
        0,
      output:
        (hasCommandCodeMetadata ? raw.pricing?.completion : undefined) ??
        (preferCatalog ? meta?.cost?.output : undefined) ??
        raw.pricing?.completion ??
        meta?.cost?.output ??
        userEntry?.cost?.output ??
        0,
      thinking: undefined,
      cacheRead: meta?.cost?.cacheRead ?? userEntry?.cost?.cacheRead ?? 0,
      cacheWrite: meta?.cost?.cacheWrite ?? userEntry?.cost?.cacheWrite ?? 0,
    };

    // Display name: catalog pretty name → humanized slug.
    // Ignore user yml names that are still raw slugs / double-suffixed.
    let baseName: string;
    if (hasCommandCodeMetadata && raw.name) {
      baseName = raw.name;
    } else if (meta?.name) {
      baseName = meta.name;
      // Variant suffixes like -high / -review that catalog collapses should stay visible
      const variant = variantLabel(modelName, catalogMatch?.canonicalId);
      if (variant) {
        for (const part of variant.split(" ")) {
          if (!baseName.toLowerCase().includes(part.toLowerCase())) {
            baseName = `${baseName} ${part}`;
          }
        }
      }
    } else if (userEntry?.name && !isRawSlugName(userEntry.name, modelName, prefix)) {
      baseName = userEntry.name.replace(/\s*\([^)]*\)\s*$/g, "").trim();
    } else {
      baseName = humanizeModelName(modelName);
    }
    const displayName = buildDisplayName(baseName, prefix);

    const has9Router = !!(raw.context_length || raw.max_tokens || raw.pricing);
    const hasCatalog = !!catalogMatch;
    const usedUser =
      !!userEntry &&
      !has9Router &&
      !hasCatalog &&
      (!isHeuristicContext(userEntry.contextWindow) ||
        (userEntry.name != null && !isRawSlugName(userEntry.name, modelName, prefix)));

    let source: EnrichedModel["enrichmentSource"];
    if (has9Router) {
      source = "9router-metadata";
      from9Router++;
    } else if (hasCatalog) {
      source = "omp-catalog";
      fromCatalog++;
    } else if (usedUser) {
      source = "user-models-yml";
      fromUserYml++;
    } else {
      source = "heuristic";
      heuristicOnly++;
    }

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

  const filtered = applyModelFilters(enriched, config);

  return {
    enriched: filtered,
    stats: { total: rawModels.length, from9Router, fromUserYml, fromCatalog, heuristicOnly, skipped, errors },
  };
}

/** Append effort/review/agent labels when catalog match collapsed them away. */
function variantLabel(modelName: string, canonicalId?: string): string | undefined {
  const bare = modelName.includes("/") ? modelName.slice(modelName.lastIndexOf("/") + 1) : modelName;
  // strip parens so xhigh(ultra) → xhigh ultra
  const tokens = bare
    .toLowerCase()
    .replace(/[()[\]]/g, "-")
    .split(/[-_:.]+/)
    .filter(Boolean);
  const has = (t: string) => tokens.includes(t);
  const labels: string[] = [];
  if (has("high") && !has("highspeed") && !has("xhigh")) labels.push("High");
  if (has("xhigh")) labels.push("XHigh");
  if (has("medium")) labels.push("Medium");
  if (has("extra") && has("low")) labels.push("Extra Low");
  else if (has("low")) labels.push("Low");
  if (has("preview")) labels.push("Preview");
  if (has("agent") && !canonicalId?.includes("agent")) labels.push("Agent");
  if (has("highspeed") || (has("high") && has("speed"))) labels.push("Highspeed");
  if (has("turbo")) labels.push("Turbo");
  if (has("code") || has("coder")) labels.push("Code");
  if (has("free")) labels.push("Free");
  // product lines before review so "GPT 5.6 Sol Review" not "Review Sol"
  if (has("sol")) labels.push("Sol");
  if (has("terra")) labels.push("Terra");
  if (has("luna")) labels.push("Luna");
  if (has("spark")) labels.push("Spark");
  if (has("review")) labels.push("Review");
  if (has("ultra")) labels.push("Ultra");
  if (has("max")) labels.push("Max");
  if (labels.length === 0) return undefined;
  return labels.join(" ");
}

export function buildDisplayName(name: string, prefix: string): string {
  if (!prefix) return name;

  const suffix = ` (${prefix})`;
  let base = name;
  // strip any trailing "(prefix)" pollution, case-insensitive
  const re = new RegExp(`\\s*\\(${escapeRegExp(prefix)}\\)\\s*$`, "i");
  while (re.test(base)) {
    base = base.replace(re, "").trim();
  }
  // also strip any leftover double provider suffixes like "(cx) (cx)"
  base = base.replace(/(\s*\([a-z0-9_-]+\)){2,}\s*$/i, "").trim();
  return `${base}${suffix}`;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wildcardMatch(pattern: string, value: string): boolean {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
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
    if (includeModels?.length && includeOnly) {
      const matched = includeModels.some((p) => wildcardMatch(p, m.id));
      if (!matched) return false;
    }
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

/** Test helper — clear models.yml cache between cases. */
export function clearUserYmlCache(): void {
  userYmlCache = null;
}

function normalizeInput(input: string[]): ("text" | "image")[] {
  const supported = input.filter((item) => item === "text" || item === "image");
  return supported.length > 0 ? (Array.from(new Set(supported)) as ("text" | "image")[]) : ["text"];
}
