import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
/**
 * Config loader for 9Router Sync.
 *
 * Resolution order:
 * 1. Explicit overrides passed to loadConfig()
 * 2. Environment variables (NINEROUTER_BASE_URL, NINEROUTER_API_KEY)
 * 3. Config file ~/.omp/9router.yml
 * 4. Hardcoded defaults
 */
import type { NineRouterConfig } from "./types";

const DEFAULT_BASE_URL = "http://localhost:20128/v1";
const DEFAULT_PROVIDER_ID = "nine-router";

interface ConfigOverride {
  baseUrl?: string;
  apiKey?: string;
  providerId?: string;
  modelsYmlPath?: string;
  outputPath?: string;
  excludeModels?: string[];
  includeModels?: string[];
  includeOnly?: boolean;
}

interface ConfigFileShape {
  baseUrl?: string;
  apiKey?: string;
  providerId?: string;
  modelsPath?: string;
  outputPath?: string;
  excludeModels?: string[];
  includeModels?: string[];
  includeOnly?: boolean;
}

export function loadConfig(overrides?: ConfigOverride): NineRouterConfig {
  const env = {
    baseUrl: process.env.NINEROUTER_BASE_URL,
    apiKey: process.env.NINEROUTER_API_KEY,
  };

  const file = readConfigFile();

  const baseUrl = overrides?.baseUrl ?? env.baseUrl ?? file?.baseUrl ?? DEFAULT_BASE_URL;
  const apiKey = overrides?.apiKey ?? env.apiKey ?? file?.apiKey ?? "";
  const providerId = overrides?.providerId ?? file?.providerId ?? DEFAULT_PROVIDER_ID;

  const defaultAgentDir = join(homedir(), ".omp", "agent");

  // Resolve modelsYmlPath: override > config file > default
  const modelsPathSource = overrides?.modelsYmlPath ?? file?.modelsPath ?? "models.yml";
  const modelsYmlPath = modelsPathSource.startsWith("/") ? modelsPathSource : join(defaultAgentDir, modelsPathSource);

  // Resolve outputPath: override > config file > default
  const outputSource = overrides?.outputPath ?? file?.outputPath ?? "nine-router.generated.yml";
  const outputPath = outputSource.startsWith("/") ? outputSource : join(defaultAgentDir, outputSource);

  const excludeModels = overrides?.excludeModels ?? file?.excludeModels;
  const includeModels = overrides?.includeModels ?? file?.includeModels;
  const includeOnly = overrides?.includeOnly ?? file?.includeOnly;

  return { baseUrl, apiKey, providerId, modelsYmlPath, outputPath, excludeModels, includeModels, includeOnly };
}

function readConfigFile(): ConfigFileShape | null {
  const paths = [join(homedir(), ".omp", "9router.yml"), join(homedir(), ".omp", "9router.yaml")];
  for (const p of paths) {
    if (existsSync(p)) {
      try {
        const raw = readFileSync(p, "utf-8");
        return parseSimpleYaml(raw);
      } catch {
        // malformed config → skip
      }
    }
  }
  return null;
}

/** Extremely minimal YAML parser — only handles flat key:value at top level. */
function parseSimpleYaml(raw: string): ConfigFileShape {
  const result: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const colon = trimmed.indexOf(":");
    if (colon === -1) continue;
    const key = trimmed.slice(0, colon).trim();
    const value = trimmed
      .slice(colon + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    result[key] = value;
  }
  const parseList = (v: string) =>
    v
      ? v
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;
  const parseBool = (v: string) => (v ? v === "true" || v === "yes" || v === "1" : undefined);
  return {
    baseUrl: result.baseUrl,
    apiKey: result.apiKey,
    providerId: result.providerId,
    modelsPath: result.modelsPath,
    outputPath: result.outputPath,
    excludeModels: parseList(result.excludeModels),
    includeModels: parseList(result.includeModels),
    includeOnly: parseBool(result.includeOnly),
  };
}
