import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fetchModels } from "./client";
import { loadConfig } from "./config";
import { enrichModels } from "./enrichment";
import { buildResult, generateYamlBlock, saveSidecar } from "./generator";
import { setLiveCatalog } from "./mapper";
/**
 * Core sync logic — shared between extension and CLI.
 *
 * Fetches 9Router models, enriches, generates YAML block,
 * writes to sidecar AND optionally merges into models.yml.
 */
import type { EnrichedModel, GenerateResult, LiveModel, NineRouterConfig } from "./types";

export interface SyncOptions {
  config?: Partial<NineRouterConfig>;
  liveModels?: LiveModel[];
  /** If true, also merge into models.yml (not just sidecar) */
  autoMerge?: boolean;
}

export interface SyncResult extends GenerateResult {
  /** Enriched models ready for registerProvider() */
  enrichedModels: EnrichedModel[];
}

export async function syncNineRouter(options: SyncOptions = {}): Promise<SyncResult> {
  const config = loadConfig(options.config);

  setLiveCatalog(options.liveModels ?? []);

  if (!config.apiKey) {
    return {
      ...buildResult(
        0,
        0,
        0,
        0,
        ["No API key configured. Set NINEROUTER_API_KEY env var or add apiKey to ~/.omp/9router.yml"],
        "",
        config.outputPath!,
      ),
      enrichedModels: [],
    };
  }

  const fetchResult = await fetchModels(config.baseUrl, config.apiKey);
  if (fetchResult.errors.length > 0) {
    return {
      ...buildResult(0, 0, 0, 0, fetchResult.errors, "", config.outputPath!),
      enrichedModels: [],
    };
  }
  if (fetchResult.models.length === 0) {
    return {
      ...buildResult(0, 0, 0, 0, ["9Router returned 0 models"], "", config.outputPath!),
      enrichedModels: [],
    };
  }

  const enrichResult = enrichModels(fetchResult.models, config);
  const yamlBlock = generateYamlBlock(enrichResult.enriched, config);
  const outputPath = config.outputPath!;
  saveSidecar(yamlBlock, outputPath);

  // Auto-merge into models.yml if requested
  if (options.autoMerge) {
    mergeIntoModelsYml(config, enrichResult.enriched);
  }

  return {
    ...buildResult(
      fetchResult.models.length,
      enrichResult.enriched.length,
      enrichResult.stats.heuristicOnly,
      enrichResult.stats.skipped,
      enrichResult.stats.errors,
      yamlBlock,
      outputPath,
    ),
    enrichedModels: enrichResult.enriched,
  };
}

/**
 * Merge enriched 9Router models into models.yml with atomic backup.
 *
 * Strategy:
 * 1. Backup → models.yml.bak (DANGER: overwrites)
 * 2. Write merged content → models.yml.tmp
 * 3. Rename models.yml.tmp → models.yml (atomic on same FS)
 * 4. Validate: re-read models.yml → if it parses and contains 9Router
 *    models, keep; else restore from backup.
 */
function mergeIntoModelsYml(config: NineRouterConfig, models: EnrichedModel[]): void {
  const targetPath = config.modelsYmlPath || join(process.env.HOME || "/tmp", ".omp", "agent", "models.yml");
  const backupPath = `${targetPath}.bak`;
  const tmpPath = `${targetPath}.tmp`;

  const existing = existsSync(targetPath) ? readFileSync(targetPath, "utf-8") : "";
  const lines = existing.split("\n");
  const providerId = config.providerId;

  // Build merged content
  let merged: string;
  if (!existing) {
    merged = generateYamlBlock(models, config);
  } else {
    const providerStart = findLine(lines, `  ${providerId}:`);
    if (providerStart === -1) {
      const block = generateProviderBlock(config, models);
      merged = `${existing.trimEnd()}\n${block}\n`;
    } else {
      let providerEnd = lines.length;
      for (let i = providerStart + 1; i < lines.length; i++) {
        const line = lines[i];
        if (line.match(/^ {2}\w/) && !line.startsWith("    ")) {
          providerEnd = i;
          break;
        }
      }
      const newBlock = generateProviderBlock(config, models);
      const before = lines.slice(0, providerStart);
      const after = lines.slice(providerEnd);
      merged = [...before, ...newBlock.split("\n"), ...after].join("\n");
    }
  }

  // Atomic write: backup → tmp → rename
  try {
    // 1. Write backup
    writeFileSync(backupPath, existing, "utf-8");

    // 2. Write tmp
    writeFileSync(tmpPath, merged, "utf-8");

    // 3. Atomic rename
    const { renameSync } = require("node:fs") as typeof import("node:fs");
    renameSync(tmpPath, targetPath);

    // 4. Validate
    const final = readFileSync(targetPath, "utf-8");
    const hasProvider = final.includes(`  ${providerId}:`);
    const hasModelsSection = final.includes("      - id: ");
    const expectedModelsPresent = models.length > 0;
    if (!hasProvider || expectedModelsPresent !== hasModelsSection) {
      throw new Error(
        `Validation failed: provider=${hasProvider} modelsPresent=${hasModelsSection} expected=${expectedModelsPresent}`,
      );
    }
  } catch (err) {
    // Restore from backup
    if (existsSync(backupPath)) {
      try {
        const backup = readFileSync(backupPath, "utf-8");
        writeFileSync(targetPath, backup, "utf-8");
      } catch {
        // last resort failed, but backup is there on disk
      }
    }
    // Clean tmp if it still exists
    try {
      require("node:fs").unlinkSync(tmpPath);
    } catch {
      /* ok */
    }
    throw err;
  }
}

function generateProviderBlock(config: NineRouterConfig, models: EnrichedModel[]): string {
  const lines: string[] = [
    `  ${config.providerId}:`,
    `    baseUrl: ${ensureV1BaseUrl(config.baseUrl)}`,
    "    apiKey: NINEROUTER_API_KEY",
    "    api: openai-completions",
    "    authHeader: true",
    "    compat:",
    "      supportsDeveloperRole: false",
    "      supportsReasoningEffort: false",
    "      supportsUsageInStreaming: true",
    "      maxTokensField: max_tokens",
    "    models:",
  ];

  for (const m of models) {
    lines.push(`      - id: ${m.id}`);
    lines.push(`        name: ${escapeYaml(m.name)}`);
    lines.push(`        api: ${m.api || "openai-completions"}`);
    if (m.thinking?.length)
      lines.push(`        thinking:\n          mode: effort\n          efforts: [${m.thinking.join(", ")}]`);
    lines.push(`        contextWindow: ${m.contextWindow}`);
    lines.push(`        maxTokens: ${m.maxTokens}`);
    lines.push("        cost:");
    lines.push(`          input: ${m.cost.input}`);
    lines.push(`          output: ${m.cost.output}`);
    lines.push(`          cacheRead: ${m.cost.cacheRead}`);
    lines.push(`          cacheWrite: ${m.cost.cacheWrite}`);
    lines.push("");
  }

  return lines.join("\n");
}

function ensureV1BaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

function findLine(lines: string[], needle: string): number {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === needle.trim()) return i;
  }
  return -1;
}

function escapeYaml(s: string): string {
  if (/[":{}[\],&*#?|<>!%@`]/.test(s) || s.includes("\\")) {
    return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return s;
}
