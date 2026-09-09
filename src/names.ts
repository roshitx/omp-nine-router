/**
 * Pretty display names from 9Router slugs.
 *
 * "gcli/grok-4.5" → "Grok 4.5"
 * "ocg/deepseek-v4-pro" → "DeepSeek V4 Pro"
 * "openrouter/qwen/qwen3-coder:free" → "Qwen3 Coder Free"
 */

const TOKEN_MAP: Record<string, string> = {
  gpt: "GPT",
  glm: "GLM",
  tts: "TTS",
  asr: "ASR",
  ctc: "CTC",
  oss: "OSS",
  ai: "AI",
  claude: "Claude",
  gemini: "Gemini",
  gemma: "Gemma",
  grok: "Grok",
  deepseek: "DeepSeek",
  kimi: "Kimi",
  qwen: "Qwen",
  llama: "Llama",
  minimax: "MiniMax",
  mimo: "MiMo",
  flash: "Flash",
  pro: "Pro",
  mini: "Mini",
  nano: "Nano",
  turbo: "Turbo",
  preview: "Preview",
  high: "High",
  xhigh: "XHigh",
  medium: "Medium",
  low: "Low",
  max: "Max",
  code: "Code",
  coder: "Coder",
  codex: "Codex",
  sonnet: "Sonnet",
  opus: "Opus",
  haiku: "Haiku",
  instruct: "Instruct",
  agent: "Agent",
  review: "Review",
  sol: "Sol",
  terra: "Terra",
  luna: "Luna",
  spark: "Spark",
  omni: "Omni",
  free: "Free",
  instant: "Instant",
  versatile: "Versatile",
  maverick: "Maverick",
  reasoning: "Reasoning",
  highspeed: "Highspeed",
  ultra: "Ultra",
  super: "Super",
  north: "North",
  laguna: "Laguna",
  owl: "Owl",
  alpha: "Alpha",
  lyria: "Lyria",
  clip: "Clip",
  kat: "KAT",
  nemotron: "Nemotron",
  parakeet: "Parakeet",
  moonshotai: "Moonshot",
  "zai-org": "Z.AI",
  minimaxai: "MiniMax",
  "deepseek-ai": "DeepSeek",
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  meta: "Meta",
  xiaomi: "Xiaomi",
  cohere: "Cohere",
  poolside: "Poolside",
  tencent: "Tencent",
  kwaipilot: "Kwaipilot",
  openrouter: "OpenRouter",
};

const PROVIDER_MAP: Record<string, string> = {
  gcli: "GCLI",
  ocg: "OCG",
  cx: "CX",
  openai: "OpenAI",
  gc: "GC",
  gemini: "Gemini",
  groq: "Groq",
  sp: "SP",
  nvidia: "NVIDIA",
  openagentic: "OpenAgentic",
  ag: "AG",
  openrouter: "OpenRouter",
  cmc: "CMC",
  conduit: "Conduit",
  cl: "CL",
  mimo: "MiMo",
  "tencent-tokenhub": "Tencent",
  ollama: "Ollama",
  combo: "Combo",
};

/** Last path segment, drop openrouter-style `:tag` into its own token. */
export function baseModelSlug(slug: string): string {
  let s = slug.trim();
  const slash = s.lastIndexOf("/");
  if (slash !== -1) s = s.slice(slash + 1);
  return s.replace(/:/g, "-");
}

export function humanizeProvider(prefix: string): string {
  if (!prefix) return "";
  const key = prefix.toLowerCase();
  if (PROVIDER_MAP[key]) return PROVIDER_MAP[key];
  return prefix
    .split(/[-_]/)
    .filter(Boolean)
    .map(titleToken)
    .join(" ");
}

/**
 * Humanize a model id or bare model slug into a display name.
 * Does NOT append provider — caller decides.
 */
export function humanizeModelName(slug: string): string {
  const base = baseModelSlug(slug);
  if (!base) return slug;

  // Combo / bare marketing names: Best, Mocin, Judge
  if (!/[._-]/.test(base) && !/\d/.test(base)) {
    return titleToken(base);
  }

  const parts = base.split(/[-_]+/).filter(Boolean);
  return parts.map(titleToken).join(" ").replace(/\s+/g, " ").trim();
}

/**
 * True when a stored name is just the raw slug form (optionally with provider suffix).
 * Used to ignore polluted user models.yml names.
 */
export function isRawSlugName(name: string, modelSlug: string, _prefix: string): boolean {
  const n = name.trim().toLowerCase();
  if (!n) return true;
  const base = baseModelSlug(modelSlug).toLowerCase();
  // repeated suffix pollution: "gpt-5.5 (cx) (cx)"
  if (/\([a-z0-9_-]+\)(\s*\([a-z0-9_-]+\))+/.test(n)) return true;
  // strip one trailing "(provider)" then compare to slug
  const stripped = n
    .replace(/\s*\([^)]*\)\s*$/g, "")
    .trim()
    .toLowerCase();
  if (stripped === base) return true;
  if (stripped === modelSlug.toLowerCase()) return true;
  // slug-like only (no spaces): punctuation-insensitive compare
  if (!/\s/.test(stripped)) {
    const compact = (s: string) => s.replace(/[^a-z0-9]/g, "");
    if (compact(stripped) === compact(base)) return true;
  }
  return false;
}

function titleToken(token: string): string {
  if (!token) return token;

  // pure version: 4.5, 3.1, 120b, 70b, 17b, 8b, 32b, 80b, 26b, 31b, 550b, 1.1b
  if (/^\d+(\.\d+)*[a-z]*$/i.test(token) && /\d/.test(token)) {
    // 120b → 120B, 4.5 stays 4.5
    return token.replace(/([0-9])([a-z]+)$/i, (_, d, u) => d + u.toUpperCase());
  }

  // o1 / o3 / o4
  if (/^o\d+[a-z]*$/i.test(token)) {
    return token.toUpperCase();
  }

  const lower = token.toLowerCase();
  if (TOKEN_MAP[lower]) return TOKEN_MAP[lower];

  // gpt5.4 style glued
  if (/^gpt\d/i.test(token)) {
    return `GPT${token.slice(3)}`;
  }
  if (/^glm\d/i.test(token)) {
    return `GLM${token.slice(3)}`;
  }

  // xs.2 / m.1 style
  if (/^[a-z]+\.\d+/i.test(token)) {
    const [a, ...rest] = token.split(".");
    return `${titleToken(a)}.${rest.join(".")}`;
  }

  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}
