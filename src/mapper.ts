/**
 * Slug → OMP canonical ID fuzzy matcher.
 *
 * Priority: live OMP catalog (injected at runtime) → static fallback.
 * Returns best match with confidence + metadata for enrichment.
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
  name: string;
  contextWindow: number;
  maxTokens: number;
  input: string[];
  reasoning: boolean;
  thinking?: string[];
  api: string;
  cost: OmpModelMetadata["cost"];
  aliases: string[];
}

const EFFORT = ["minimal", "low", "medium", "high"] as const;
const EFFORT_X = ["low", "medium", "high", "xhigh"] as const;
const EFFORT_FULL = ["minimal", "low", "medium", "high", "xhigh"] as const;

function km(
  canonicalId: string,
  provider: string,
  name: string,
  opts: {
    contextWindow: number;
    maxTokens: number;
    input?: string[];
    reasoning?: boolean;
    thinking?: string[];
    api?: string;
    cost?: OmpModelMetadata["cost"];
    aliases?: string[];
  },
): KnownModel {
  return {
    canonicalId,
    provider,
    name,
    contextWindow: opts.contextWindow,
    maxTokens: opts.maxTokens,
    input: opts.input ?? ["text"],
    reasoning: opts.reasoning ?? false,
    thinking: opts.thinking,
    api: opts.api ?? "openai-completions",
    cost: opts.cost ?? { input: 0, output: 0 },
    aliases: opts.aliases ?? [],
  };
}

const KNOWN_MODELS: KnownModel[] = [
  // Anthropic
  km("claude-opus-4-8", "anthropic", "Claude Opus 4.8", {
    contextWindow: 1_000_000,
    maxTokens: 128_000,
    input: ["text", "image"],
    reasoning: true,
    thinking: [...EFFORT],
    api: "anthropic-messages",
    cost: { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
    aliases: ["claude-opus-4.8", "opus-4.8", "opus-4-8"],
  }),
  km("claude-opus-4-7", "anthropic", "Claude Opus 4.7", {
    contextWindow: 1_000_000,
    maxTokens: 128_000,
    input: ["text", "image"],
    reasoning: true,
    thinking: [...EFFORT],
    api: "anthropic-messages",
    cost: { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
    aliases: ["claude-opus-4.7", "opus-4.7"],
  }),
  km("claude-opus-4-6", "anthropic", "Claude Opus 4.6", {
    contextWindow: 1_000_000,
    maxTokens: 128_000,
    input: ["text", "image"],
    reasoning: true,
    thinking: [...EFFORT],
    api: "anthropic-messages",
    cost: { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
    aliases: ["claude-opus-4.6", "opus-4.6"],
  }),
  km("claude-opus-4-5", "anthropic", "Claude Opus 4.5", {
    contextWindow: 200_000,
    maxTokens: 64_000,
    input: ["text", "image"],
    reasoning: true,
    thinking: [...EFFORT],
    api: "anthropic-messages",
    cost: { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
    aliases: ["claude-opus-4.5", "opus-4.5"],
  }),
  km("claude-opus-4", "anthropic", "Claude Opus 4", {
    contextWindow: 200_000,
    maxTokens: 32_768,
    input: ["text", "image"],
    reasoning: true,
    thinking: [...EFFORT],
    api: "anthropic-messages",
    cost: { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
    aliases: ["claude-opus-4", "opus-4"],
  }),
  km("claude-sonnet-4-6", "anthropic", "Claude Sonnet 4.6", {
    contextWindow: 1_000_000,
    maxTokens: 128_000,
    input: ["text", "image"],
    reasoning: true,
    thinking: [...EFFORT],
    api: "anthropic-messages",
    cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
    aliases: ["claude-sonnet-4.6", "sonnet-4.6", "sonnet-4-6"],
  }),
  km("claude-sonnet-4-5", "anthropic", "Claude Sonnet 4.5", {
    contextWindow: 200_000,
    maxTokens: 64_000,
    input: ["text", "image"],
    reasoning: true,
    thinking: [...EFFORT],
    api: "anthropic-messages",
    cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
    aliases: ["claude-sonnet-4.5", "sonnet-4.5", "sonnet-4-5"],
  }),
  km("claude-sonnet-4", "anthropic", "Claude Sonnet 4", {
    contextWindow: 200_000,
    maxTokens: 64_000,
    input: ["text", "image"],
    reasoning: true,
    thinking: [...EFFORT],
    api: "anthropic-messages",
    cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
    aliases: ["claude-sonnet-4", "sonnet-4"],
  }),
  km("claude-haiku-4-5", "anthropic", "Claude Haiku 4.5", {
    contextWindow: 200_000,
    maxTokens: 64_000,
    input: ["text", "image"],
    reasoning: false,
    api: "anthropic-messages",
    cost: { input: 0.8, output: 4, cacheRead: 0.08, cacheWrite: 1 },
    aliases: ["claude-haiku-4.5", "haiku-4.5"],
  }),

  // OpenAI / Codex
  km("gpt-5.6", "openai-codex", "GPT 5.6", {
    contextWindow: 1_050_000,
    maxTokens: 128_000,
    input: ["text", "image"],
    reasoning: true,
    thinking: [...EFFORT_X],
    cost: { input: 2.5, output: 10, cacheRead: 0.625, cacheWrite: 2.5 },
    aliases: ["gpt-5-6", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.6-sol-review", "gpt-5.6-terra-review", "gpt-5.6-luna-review", "gpt-5.6-sol-xhigh", "gpt-5.6-terra-xhigh", "gpt-5.6-luna-xhigh"],
  }),
  km("gpt-5.5", "openai-codex", "GPT 5.5", {
    contextWindow: 1_050_000,
    maxTokens: 128_000,
    input: ["text", "image"],
    reasoning: true,
    thinking: [...EFFORT_X],
    cost: { input: 2.5, output: 10, cacheRead: 0.625, cacheWrite: 2.5 },
    aliases: ["gpt-5-5", "gpt-5.5-review"],
  }),
  km("gpt-5.4", "openai-codex", "GPT 5.4", {
    contextWindow: 1_050_000,
    maxTokens: 128_000,
    input: ["text", "image"],
    reasoning: true,
    thinking: [...EFFORT_X],
    cost: { input: 2.5, output: 10, cacheRead: 0.625, cacheWrite: 2.5 },
    aliases: ["gpt-5-4", "gpt-5.4-review"],
  }),
  km("gpt-5.4-mini", "openai-codex", "GPT 5.4 Mini", {
    contextWindow: 400_000,
    maxTokens: 128_000,
    input: ["text"],
    reasoning: true,
    thinking: [...EFFORT_X],
    cost: { input: 0.6, output: 2.4, cacheRead: 0.15, cacheWrite: 0.6 },
    aliases: ["gpt-5-4-mini", "gpt-5.4-mini-review"],
  }),
  km("gpt-5.4-nano", "openai-codex", "GPT 5.4 Nano", {
    contextWindow: 400_000,
    maxTokens: 128_000,
    input: ["text"],
    reasoning: true,
    thinking: [...EFFORT_X],
    cost: { input: 0.2, output: 0.8 },
    aliases: ["gpt-5-4-nano"],
  }),
  km("gpt-5.3-codex", "openai-codex", "GPT 5.3 Codex", {
    contextWindow: 400_000,
    maxTokens: 128_000,
    input: ["text"],
    reasoning: true,
    thinking: [...EFFORT_X],
    cost: { input: 1.25, output: 5, cacheRead: 0.3125, cacheWrite: 1.25 },
    aliases: ["gpt-5-3-codex", "gpt-5.3", "gpt-5.3-codex-spark", "gpt-5.3-codex-spark-review"],
  }),
  km("gpt-5.2", "openai", "GPT 5.2", {
    contextWindow: 400_000,
    maxTokens: 128_000,
    input: ["text", "image"],
    reasoning: true,
    thinking: [...EFFORT_X],
    cost: { input: 2.5, output: 10, cacheRead: 0.625, cacheWrite: 2.5 },
    aliases: ["gpt-5-2"],
  }),
  km("gpt-5.1", "openai", "GPT 5.1", {
    contextWindow: 400_000,
    maxTokens: 128_000,
    input: ["text", "image"],
    reasoning: true,
    thinking: [...EFFORT_X],
    cost: { input: 2.5, output: 10, cacheRead: 0.625, cacheWrite: 2.5 },
    aliases: ["gpt-5-1"],
  }),
  km("gpt-5", "openai", "GPT 5", {
    contextWindow: 400_000,
    maxTokens: 128_000,
    input: ["text", "image"],
    reasoning: true,
    thinking: [...EFFORT_X],
    cost: { input: 2.5, output: 10, cacheRead: 0.625, cacheWrite: 2.5 },
    aliases: [],
  }),
  km("gpt-5-mini", "openai", "GPT 5 Mini", {
    contextWindow: 400_000,
    maxTokens: 128_000,
    input: ["text"],
    reasoning: true,
    thinking: [...EFFORT_X],
    cost: { input: 0.6, output: 2.4 },
    aliases: ["gpt-5.0-mini"],
  }),
  km("gpt-5-nano", "openai", "GPT 5 Nano", {
    contextWindow: 400_000,
    maxTokens: 128_000,
    input: ["text"],
    reasoning: true,
    thinking: [...EFFORT_X],
    cost: { input: 0.2, output: 0.8 },
    aliases: [],
  }),
  km("gpt-4.1", "openai", "GPT 4.1", {
    contextWindow: 1_047_576,
    maxTokens: 32_768,
    input: ["text", "image"],
    reasoning: false,
    cost: { input: 2, output: 8 },
    aliases: ["gpt-4-1"],
  }),
  km("gpt-4.1-mini", "openai", "GPT 4.1 Mini", {
    contextWindow: 1_047_576,
    maxTokens: 32_768,
    input: ["text", "image"],
    reasoning: false,
    cost: { input: 0.4, output: 1.6 },
    aliases: ["gpt-4-1-mini"],
  }),
  km("gpt-4.1-nano", "openai", "GPT 4.1 Nano", {
    contextWindow: 1_047_576,
    maxTokens: 32_768,
    input: ["text", "image"],
    reasoning: false,
    cost: { input: 0.1, output: 0.4 },
    aliases: ["gpt-4-1-nano"],
  }),
  km("gpt-4o", "openai", "GPT 4o", {
    contextWindow: 128_000,
    maxTokens: 16_384,
    input: ["text", "image"],
    reasoning: false,
    cost: { input: 2.5, output: 10 },
    aliases: ["gpt-4-o"],
  }),
  km("gpt-4o-mini", "openai", "GPT 4o Mini", {
    contextWindow: 128_000,
    maxTokens: 16_384,
    input: ["text", "image"],
    reasoning: false,
    cost: { input: 0.15, output: 0.6 },
    aliases: ["gpt-4-o-mini"],
  }),
  km("gpt-4-turbo", "openai", "GPT 4 Turbo", {
    contextWindow: 128_000,
    maxTokens: 4_096,
    input: ["text", "image"],
    reasoning: false,
    cost: { input: 10, output: 30 },
    aliases: ["gpt-4-turbo"],
  }),
  km("o3", "openai", "O3", {
    contextWindow: 200_000,
    maxTokens: 100_000,
    input: ["text", "image"],
    reasoning: true,
    thinking: [...EFFORT_X],
    cost: { input: 10, output: 40 },
    aliases: [],
  }),
  km("o3-mini", "openai", "O3 Mini", {
    contextWindow: 200_000,
    maxTokens: 100_000,
    input: ["text"],
    reasoning: true,
    thinking: [...EFFORT_X],
    cost: { input: 1.1, output: 4.4 },
    aliases: [],
  }),
  km("o3-pro", "openai", "O3 Pro", {
    contextWindow: 200_000,
    maxTokens: 100_000,
    input: ["text", "image"],
    reasoning: true,
    thinking: [...EFFORT_X],
    cost: { input: 20, output: 80 },
    aliases: [],
  }),
  km("o4-mini", "openai", "O4 Mini", {
    contextWindow: 200_000,
    maxTokens: 100_000,
    input: ["text", "image"],
    reasoning: true,
    thinking: [...EFFORT_X],
    cost: { input: 1.1, output: 4.4 },
    aliases: [],
  }),
  km("o1", "openai", "O1", {
    contextWindow: 200_000,
    maxTokens: 100_000,
    input: ["text", "image"],
    reasoning: true,
    thinking: [...EFFORT_X],
    cost: { input: 15, output: 60 },
    aliases: [],
  }),
  km("o1-mini", "openai", "O1 Mini", {
    contextWindow: 128_000,
    maxTokens: 65_536,
    input: ["text"],
    reasoning: true,
    thinking: [...EFFORT_X],
    cost: { input: 3, output: 12 },
    aliases: [],
  }),
  km("gpt-oss-120b", "openai", "GPT OSS 120B", {
    contextWindow: 131_072,
    maxTokens: 131_072,
    input: ["text"],
    reasoning: true,
    thinking: [...EFFORT],
    cost: { input: 0, output: 0 },
    aliases: ["openai/gpt-oss-120b", "gpt-oss-120b-medium", "gpt-oss-120b:free"],
  }),

  // Google
  km("gemini-3.5-flash", "google", "Gemini 3.5 Flash", {
    contextWindow: 1_048_576,
    maxTokens: 65_536,
    input: ["text", "image"],
    reasoning: true,
    thinking: [...EFFORT],
    cost: { input: 0.15, output: 0.6 },
    aliases: ["gemini-3-5-flash", "gemini-3.5-flash-low", "gemini-3.5-flash-extra-low"],
  }),
  km("gemini-3.1-pro", "google", "Gemini 3.1 Pro", {
    contextWindow: 1_048_576,
    maxTokens: 65_536,
    input: ["text", "image"],
    reasoning: true,
    thinking: [...EFFORT],
    cost: { input: 1.25, output: 10, cacheRead: 0.3125, cacheWrite: 1.25 },
    aliases: [
      "gemini-3.1-pro-preview",
      "gemini-3-1-pro-preview",
      "gemini-3.1-pro-low",
      "gemini-pro-agent",
    ],
  }),
  km("gemini-3.1-flash-lite", "google", "Gemini 3.1 Flash Lite", {
    contextWindow: 1_048_576,
    maxTokens: 65_536,
    input: ["text", "image"],
    reasoning: true,
    thinking: [...EFFORT],
    cost: { input: 0.1, output: 0.4 },
    aliases: ["gemini-3.1-flash-lite-preview", "gemini-3-1-flash-lite-preview"],
  }),
  km("gemini-3-pro", "google", "Gemini 3 Pro", {
    contextWindow: 1_048_576,
    maxTokens: 65_536,
    input: ["text", "image"],
    reasoning: true,
    thinking: [...EFFORT],
    cost: { input: 1.25, output: 10 },
    aliases: ["gemini-3-pro-preview"],
  }),
  km("gemini-3-flash", "google", "Gemini 3 Flash", {
    contextWindow: 1_048_576,
    maxTokens: 65_536,
    input: ["text", "image"],
    reasoning: true,
    thinking: [...EFFORT],
    cost: { input: 0.15, output: 0.6 },
    aliases: ["gemini-3-flash-preview", "gemini-3-flash-agent"],
  }),
  km("gemini-2.5-pro", "google", "Gemini 2.5 Pro", {
    contextWindow: 1_048_576,
    maxTokens: 65_536,
    input: ["text", "image"],
    reasoning: true,
    thinking: [...EFFORT],
    cost: { input: 1.25, output: 10, cacheRead: 0.3125, cacheWrite: 1.25 },
    aliases: ["gemini-2-5-pro"],
  }),
  km("gemini-2.5-flash", "google", "Gemini 2.5 Flash", {
    contextWindow: 1_048_576,
    maxTokens: 65_536,
    input: ["text", "image"],
    reasoning: true,
    thinking: [...EFFORT],
    cost: { input: 0.15, output: 0.6 },
    aliases: ["gemini-2-5-flash"],
  }),
  km("gemini-2.5-flash-lite", "google", "Gemini 2.5 Flash Lite", {
    contextWindow: 1_048_576,
    maxTokens: 65_536,
    input: ["text", "image"],
    reasoning: true,
    thinking: [...EFFORT],
    cost: { input: 0.1, output: 0.4 },
    aliases: ["gemini-2-5-flash-lite"],
  }),
  km("gemma-4-31b-it", "google", "Gemma 4 31B IT", {
    contextWindow: 262_144,
    maxTokens: 8_192,
    input: ["text"],
    reasoning: false,
    cost: { input: 0, output: 0 },
    aliases: ["gemma-4-31b", "google/gemma-4-31b-it", "google/gemma-4-31b-it:free"],
  }),
  km("gemma-4-26b-a4b-it", "google", "Gemma 4 26B A4B IT", {
    contextWindow: 262_144,
    maxTokens: 32_768,
    input: ["text"],
    reasoning: false,
    cost: { input: 0, output: 0 },
    aliases: ["google/gemma-4-26b-a4b-it", "google/gemma-4-26b-a4b-it:free"],
  }),

  // xAI Grok
  km("grok-4.5", "xai", "Grok 4.5", {
    contextWindow: 500_000,
    maxTokens: 64_000,
    input: ["text", "image"],
    reasoning: true,
    thinking: [...EFFORT_X],
    cost: { input: 2, output: 8 },
    aliases: ["grok-4-5", "grok-4.5-high", "grok-4.5-medium", "grok-4.5-low"],
  }),
  km("grok-4.6", "xai", "Grok 4.6", {
    contextWindow: 500_000,
    maxTokens: 64_000,
    input: ["text", "image"],
    reasoning: true,
    thinking: [...EFFORT_X],
    cost: { input: 2, output: 6, cacheRead: 0.5 },
    aliases: ["grok-4-6"],
  }),
  km("grok-4", "xai", "Grok 4", {
    contextWindow: 256_000,
    maxTokens: 64_000,
    input: ["text", "image"],
    reasoning: true,
    thinking: [...EFFORT_X],
    cost: { input: 2, output: 8 },
    aliases: [],
  }),

  // DeepSeek
  km("deepseek-v4-pro", "deepseek", "DeepSeek V4 Pro", {
    contextWindow: 1_048_576,
    maxTokens: 384_000,
    input: ["text"],
    reasoning: true,
    thinking: [...EFFORT_FULL],
    cost: { input: 0.55, output: 2.19, cacheRead: 0.14, cacheWrite: 0.55 },
    aliases: ["deepseek-v4", "deepseek-ai/deepseek-v4-pro", "DeepSeek-V4-Pro"],
  }),
  km("deepseek-v4-flash", "deepseek", "DeepSeek V4 Flash", {
    contextWindow: 1_048_576,
    maxTokens: 384_000,
    input: ["text"],
    reasoning: true,
    thinking: [...EFFORT_FULL],
    cost: { input: 0.14, output: 0.28 },
    aliases: ["deepseek-ai/deepseek-v4-flash"],
  }),
  km("deepseek-v4-flash-vision-exp", "deepseek", "DeepSeek V4 Flash Vision (exp)", {
    contextWindow: 1_000_000,
    maxTokens: 384_000,
    input: ["text", "image"],
    reasoning: true,
    thinking: [...EFFORT_FULL],
    cost: { input: 0.22, output: 0.66, cacheRead: 0.007 },
    aliases: ["deepseek/deepseek-v4-flash-vision-exp"],
  }),
  km("deepseek-reasoner", "deepseek", "DeepSeek Reasoner", {
    contextWindow: 64_000,
    maxTokens: 8_192,
    input: ["text"],
    reasoning: true,
    thinking: [...EFFORT_FULL],
    cost: { input: 0.55, output: 2.19, cacheRead: 0.14, cacheWrite: 0.55 },
    aliases: ["deepseek-r1"],
  }),
  km("deepseek-chat", "deepseek", "DeepSeek Chat", {
    contextWindow: 64_000,
    maxTokens: 8_192,
    input: ["text"],
    reasoning: false,
    cost: { input: 0.27, output: 1.1, cacheRead: 0.07, cacheWrite: 0.27 },
    aliases: ["deepseek-v3"],
  }),

  // Moonshot Kimi
  km("kimi-k2.7", "moonshot", "Kimi K2.7", {
    contextWindow: 262_144,
    maxTokens: 262_144,
    input: ["text"],
    reasoning: true,
    thinking: [...EFFORT],
    cost: { input: 0.6, output: 2.5 },
    aliases: ["kimi-k2.7-code", "Kimi-K2.7"],
  }),
  km("kimi-k2.6", "moonshot", "Kimi K2.6", {
    contextWindow: 262_144,
    maxTokens: 262_144,
    input: ["text"],
    reasoning: true,
    thinking: [...EFFORT],
    cost: { input: 0.6, output: 2.5 },
    aliases: ["Kimi-K2.6", "moonshotai/kimi-k2.6", "moonshotai/Kimi-K2.6"],
  }),
  km("kimi-k2.5", "moonshot", "Kimi K2.5", {
    contextWindow: 262_144,
    maxTokens: 262_144,
    input: ["text"],
    reasoning: true,
    thinking: [...EFFORT],
    cost: { input: 0.6, output: 2.5 },
    aliases: ["Kimi-K2.5", "moonshotai/Kimi-K2.5"],
  }),

  // Z.AI GLM
  km("glm-5.2", "zhipu", "GLM 5.2", {
    contextWindow: 1_048_576,
    maxTokens: 128_000,
    input: ["text"],
    reasoning: true,
    thinking: [...EFFORT],
    cost: { input: 0.5, output: 2 },
    aliases: ["z-ai/glm-5.2", "zai-org/GLM-5.2", "GLM-5.2"],
  }),
  km("glm-5.1", "zhipu", "GLM 5.1", {
    contextWindow: 202_752,
    maxTokens: 128_000,
    input: ["text"],
    reasoning: true,
    thinking: [...EFFORT],
    cost: { input: 0.5, output: 2 },
    aliases: ["zai-org/GLM-5.1", "GLM-5.1"],
  }),
  km("glm-5", "zhipu", "GLM 5", {
    contextWindow: 202_752,
    maxTokens: 131_072,
    input: ["text"],
    reasoning: true,
    thinking: [...EFFORT],
    cost: { input: 0.5, output: 2 },
    aliases: ["glm-5-turbo", "zai-org/GLM-5", "GLM-5"],
  }),

  // Qwen
  km("qwen3.7-max", "qwen", "Qwen 3.7 Max", {
    contextWindow: 1_000_000,
    maxTokens: 65_536,
    input: ["text"],
    reasoning: true,
    thinking: [...EFFORT],
    cost: { input: 0.8, output: 3.2 },
    aliases: ["qwen3-7-max"],
  }),
  km("qwen3.7-plus", "qwen", "Qwen 3.7 Plus", {
    contextWindow: 1_000_000,
    maxTokens: 65_536,
    input: ["text"],
    reasoning: true,
    thinking: [...EFFORT],
    cost: { input: 0.4, output: 1.6 },
    aliases: ["qwen3-7-plus"],
  }),
  km("qwen3.6-plus", "qwen", "Qwen 3.6 Plus", {
    contextWindow: 1_000_000,
    maxTokens: 65_536,
    input: ["text"],
    reasoning: true,
    thinking: [...EFFORT],
    cost: { input: 0.4, output: 1.6 },
    aliases: ["qwen3-6-plus"],
  }),
  km("qwen3.6-flash", "qwen", "Qwen 3.6 Flash", {
    contextWindow: 1_000_000,
    maxTokens: 65_536,
    input: ["text"],
    reasoning: true,
    thinking: [...EFFORT],
    cost: { input: 0.05, output: 0.2 },
    aliases: ["qwen3-6-flash"],
  }),
  km("qwen3-coder", "qwen", "Qwen3 Coder", {
    contextWindow: 1_048_576,
    maxTokens: 65_536,
    input: ["text"],
    reasoning: true,
    thinking: [...EFFORT],
    cost: { input: 0.2, output: 0.8 },
    aliases: ["qwen-3-coder", "qwen/qwen3-coder", "qwen/qwen3-coder:free"],
  }),
  km("qwen3-32b", "qwen", "Qwen3 32B", {
    contextWindow: 131_072,
    maxTokens: 16_384,
    input: ["text"],
    reasoning: true,
    thinking: [...EFFORT],
    cost: { input: 0.1, output: 0.3 },
    aliases: ["qwen/qwen3-32b"],
  }),
  km("qwen3-next-80b", "qwen", "Qwen3 Next 80B", {
    contextWindow: 262_144,
    maxTokens: 16_384,
    input: ["text"],
    reasoning: false,
    cost: { input: 0, output: 0 },
    aliases: ["qwen/qwen3-next-80b-a3b-instruct", "qwen/qwen3-next-80b-a3b-instruct:free"],
  }),

  // MiniMax
  km("minimax-m3", "minimax", "MiniMax M3", {
    contextWindow: 1_048_576,
    maxTokens: 131_072,
    input: ["text"],
    reasoning: true,
    thinking: [...EFFORT],
    cost: { input: 0.3, output: 1.2 },
    aliases: ["MiniMax-M3", "minimaxai/minimax-m3", "MiniMaxAI/MiniMax-M3"],
  }),
  km("minimax-m2.7", "minimax", "MiniMax M2.7", {
    contextWindow: 204_800,
    maxTokens: 196_608,
    input: ["text"],
    reasoning: true,
    thinking: [...EFFORT],
    cost: { input: 0.3, output: 1.2 },
    aliases: [
      "MiniMax-M2.7",
      "MiniMax-M2.7-highspeed",
      "minimaxai/minimax-m2.7",
      "MiniMaxAI/MiniMax-M2.7",
    ],
  }),
  km("minimax-m2.5", "minimax", "MiniMax M2.5", {
    contextWindow: 204_800,
    maxTokens: 196_608,
    input: ["text"],
    reasoning: true,
    thinking: [...EFFORT],
    cost: { input: 0.3, output: 1.2 },
    aliases: ["MiniMax-M2.5"],
  }),

  // Xiaomi MiMo
  km("mimo-v2.5-pro", "xiaomi", "MiMo V2.5 Pro", {
    contextWindow: 1_048_576,
    maxTokens: 131_072,
    input: ["text"],
    reasoning: true,
    thinking: [...EFFORT],
    cost: { input: 0.2, output: 0.8 },
    aliases: ["xiaomi/mimo-v2.5-pro"],
  }),
  km("mimo-v2.5", "xiaomi", "MiMo V2.5", {
    contextWindow: 1_048_576,
    maxTokens: 131_072,
    input: ["text"],
    reasoning: false,
    cost: { input: 0.1, output: 0.4 },
    aliases: ["xiaomi/mimo-v2.5"],
  }),
  km("mimo-v2-omni", "xiaomi", "MiMo V2 Omni", {
    contextWindow: 256_000,
    maxTokens: 16_384,
    input: ["text", "image"],
    reasoning: false,
    cost: { input: 0.1, output: 0.4 },
    aliases: [],
  }),
  km("mimo-v2-flash", "xiaomi", "MiMo V2 Flash", {
    contextWindow: 256_000,
    maxTokens: 16_384,
    input: ["text"],
    reasoning: false,
    cost: { input: 0.05, output: 0.2 },
    aliases: [],
  }),

  // Meta Muse
  km("muse-spark-1.3-contributor", "meta", "Muse Spark 1.3 Contributor", {
    contextWindow: 1_048_576,
    maxTokens: 16_384,
    input: ["text", "image"],
    reasoning: true,
    thinking: [...EFFORT],
    cost: { input: 0.1, output: 0.2, cacheRead: 0.002 },
    aliases: ["meta/muse-spark-1.3-contributor"],
  }),
  km("muse-spark-1.3", "meta", "Muse Spark 1.3", {
    contextWindow: 1_048_576,
    maxTokens: 16_384,
    input: ["text", "image"],
    reasoning: true,
    thinking: [...EFFORT],
    cost: { input: 1.25, output: 4.25, cacheRead: 0.15 },
    aliases: ["meta/muse-spark-1.3"],
  }),
  km("longcat-2.0", "meituan", "LongCat 2.0", {
    contextWindow: 1_048_576,
    maxTokens: 16_384,
    input: ["text"],
    reasoning: true,
    thinking: [...EFFORT],
    cost: { input: 0, output: 0, cacheRead: 0 },
    aliases: ["meituan/longcat-2.0:free"],
  }),
  // Meta Llama
  km("llama-4-maverick", "meta", "Llama 4 Maverick", {
    contextWindow: 1_048_576,
    maxTokens: 16_384,
    input: ["text", "image"],
    reasoning: false,
    cost: { input: 0.2, output: 0.6 },
    aliases: [
      "meta-llama/llama-4-maverick-17b-128e-instruct",
      "llama-4-maverick-17b-128e-instruct",
    ],
  }),
  km("llama-3.3-70b", "meta", "Llama 3.3 70B", {
    contextWindow: 131_072,
    maxTokens: 16_384,
    input: ["text"],
    reasoning: false,
    cost: { input: 0.59, output: 0.79 },
    aliases: ["llama-3.3-70b-versatile", "llama-3-3-70b"],
  }),
  km("llama-3.1-8b", "meta", "Llama 3.1 8B", {
    contextWindow: 131_072,
    maxTokens: 16_384,
    input: ["text"],
    reasoning: false,
    cost: { input: 0.05, output: 0.08 },
    aliases: ["llama-3.1-8b-instant", "llama-3-1-8b"],
  }),

  // NVIDIA
  km("nemotron-3-ultra", "nvidia", "Nemotron 3 Ultra", {
    contextWindow: 1_000_000,
    maxTokens: 65_536,
    input: ["text"],
    reasoning: true,
    thinking: [...EFFORT],
    cost: { input: 0, output: 0 },
    aliases: [
      "nemotron-3-ultra-550b-a55b",
      "nvidia/nemotron-3-ultra-550b-a55b",
      "nvidia/nemotron-3-ultra-550b-a55b:free",
    ],
  }),
  km("nemotron-3-super", "nvidia", "Nemotron 3 Super", {
    contextWindow: 1_000_000,
    maxTokens: 262_144,
    input: ["text"],
    reasoning: true,
    thinking: [...EFFORT],
    cost: { input: 0, output: 0 },
    aliases: ["nvidia/nemotron-3-super-120b-a12b", "nvidia/nemotron-3-super-120b-a12b:free"],
  }),
  km("nemotron-3-nano", "nvidia", "Nemotron 3 Nano", {
    contextWindow: 256_000,
    maxTokens: 65_536,
    input: ["text"],
    reasoning: true,
    thinking: [...EFFORT],
    cost: { input: 0, output: 0 },
    aliases: [
      "nvidia/nemotron-3-nano-30b-a3b",
      "nvidia/nemotron-3-nano-30b-a3b:free",
      "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
      "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    ],
  }),

  // Misc
  km("kat-coder-pro", "kwaipilot", "KAT Coder Pro", {
    contextWindow: 256_000,
    maxTokens: 80_000,
    input: ["text"],
    reasoning: true,
    thinking: [...EFFORT],
    cost: { input: 0.3, output: 1.2 },
    aliases: ["kwaipilot/kat-coder-pro"],
  }),
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
  score: number;
}

function matchAgainstLive(modelName: string): CatalogMatch | null {
  if (liveModels.length === 0) return null;
  return bestMatch(liveModels.map(toCatalogCandidate), modelName);
}

function matchAgainstStatic(modelName: string): CatalogMatch | null {
  const candidates = KNOWN_MODELS.map((entry) => ({
    canonicalId: entry.canonicalId,
    provider: entry.provider,
    aliases: entry.aliases,
    metadata: {
      name: entry.name,
      contextWindow: entry.contextWindow,
      maxTokens: entry.maxTokens,
      input: entry.input,
      reasoning: entry.reasoning,
      thinking: entry.thinking,
      api: entry.api,
      cost: entry.cost,
    },
  }));
  return bestMatch(candidates, modelName);
}

function bestMatch(candidates: CatalogCandidate[], modelName: string): CatalogMatch | null {
  // Prefer bare model segment for nested ids like deepseek-ai/deepseek-v4-pro
  const bare = modelName.includes("/") ? modelName.slice(modelName.lastIndexOf("/") + 1) : modelName;
  const target = norm(bare);
  const fullTarget = norm(modelName);
  let best: MatchResult | null = null;
  for (const c of candidates) {
    for (const t of target === fullTarget ? [target] : [target, fullTarget]) {
      const result = tryMatch(c, t);
      if (result && (!best || betterThan(result, best))) {
        best = result;
      }
    }
  }
  return best?.match ?? null;
}

// ─── Single-candidate match ────────────────────────────────────────

function tryMatch(c: CatalogCandidate, target: string): MatchResult | null {
  if (norm(c.canonicalId) === target) {
    return { match: build(c, "exact"), score: 1 };
  }
  for (const alias of c.aliases) {
    if (norm(alias) === target) {
      return { match: build(c, "high"), score: 1 };
    }
  }
  // Prefer longer alias / canonical hits so gpt-5.4-mini does not collapse to gpt-5
  const cn = norm(c.canonicalId);
  if (target === cn || target.startsWith(`${cn}-`) || cn.startsWith(`${target}-`)) {
    // only allow prefix/suffix version variants when length ratio is high
    if (lengthRatio(target, cn) >= 0.6) {
      return { match: build(c, "medium"), score: lengthRatio(target, cn) };
    }
  }
  if (target.includes(cn) || cn.includes(target)) {
    const ratio = lengthRatio(target, cn);
    if (ratio >= 0.75) return { match: build(c, "medium"), score: ratio };
  }
  for (const alias of c.aliases) {
    const an = norm(alias);
    if (target === an) return { match: build(c, "high"), score: 1 };
    // allow effort/product suffixes after a known alias (gpt-5.6-sol-xhigh → gpt-5.6-sol)
    if (target.startsWith(`${an}-`) || an.startsWith(`${target}-`)) {
      const ratio = lengthRatio(target, an);
      if (ratio >= 0.55) return { match: build(c, "medium"), score: ratio };
    }
    if (target.includes(an) || an.includes(target)) {
      const ratio = lengthRatio(target, an);
      if (ratio >= 0.75) return { match: build(c, "medium"), score: ratio };
    }
  }
  const inputTokens = tokenSet(target);
  if (inputTokens.size === 0) return null;
  const allText = [c.canonicalId, ...c.aliases].map(norm).join(" ");
  const targetTokens = tokenSet(allText);
  const intersection = [...inputTokens].filter((t) => targetTokens.has(t)).length;
  const union = new Set([...inputTokens, ...targetTokens]).size;
  const jaccard = intersection / union;
  // require stronger overlap + shared version-ish token to avoid gpt-5 → gpt-5.5
  if (jaccard >= 0.7) return { match: build(c, "low"), score: jaccard };
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
      thinking: c.metadata.thinking ? [...c.metadata.thinking] : undefined,
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
      thinking: lm.thinking,
      api: lm.api,
      cost: lm.cost,
    },
  };
}
