#!/usr/bin/env node
/**
 * 9Router Sync — standalone CLI runner.
 *
 * Usage:
 *   bun run cli.ts
 *   bun run cli.ts --auto-merge          # also write to models.yml
 *   bun run cli.ts --base-url https://...
 */
import { syncNineRouter } from "./sync";

async function main() {
  const args = parseArgs();

  console.log("9Router Sync — standalone CLI\n");

  const result = await syncNineRouter({
    config: {
      baseUrl: args.baseUrl,
      apiKey: args.apiKey,
      excludeModels: args.excludeModels,
      includeModels: args.includeModels,
      includeOnly: args.includeOnly,
    },
    autoMerge: args.autoMerge,
  });

  if (result.errors.length > 0) {
    console.error("Errors:");
    for (const err of result.errors) console.error(`  ${err}`);
    process.exit(1);
  }

  console.log(`Models found:      ${result.modelsFound}`);
  console.log(`Enriched:          ${result.enriched}`);
  console.log(`Heuristic defaults:${result.heuristicDefaults}`);
  console.log(`Skipped:           ${result.skipped}`);
  console.log(`Sidecar:           ${result.outputPath}`);
  if (args.autoMerge && result.diff) {
    const diff = result.diff;
    if (diff.added.length > 0) {
      console.log(`  +${diff.added.length} new: ${diff.added.slice(0, 5).join(", ")}${diff.added.length > 5 ? "..." : ""}`);
    }
    if (diff.removed.length > 0) {
      console.log(`  -${diff.removed.length} removed: ${diff.removed.slice(0, 5).join(", ")}${diff.removed.length > 5 ? "..." : ""}`);
    }
    if (diff.added.length === 0 && diff.removed.length === 0) {
      console.log("  No changes (model list identical)");
    }
  }
  console.log();
}

function parseArgs(): {
  baseUrl?: string;
  apiKey?: string;
  autoMerge: boolean;
  excludeModels?: string[];
  includeModels?: string[];
  includeOnly?: boolean;
} {
  const result: {
    baseUrl?: string;
    apiKey?: string;
    autoMerge: boolean;
    excludeModels?: string[];
    includeModels?: string[];
    includeOnly?: boolean;
  } = { autoMerge: false };
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--base-url" && args[i + 1]) result.baseUrl = args[++i];
    else if (args[i] === "--api-key" && args[i + 1]) result.apiKey = args[++i];
    else if (args[i] === "--auto-merge") result.autoMerge = true;
    else if (args[i] === "--exclude" && args[i + 1])
      result.excludeModels = (result.excludeModels || []).concat(args[++i].split(","));
    else if (args[i] === "--include" && args[i + 1])
      result.includeModels = (result.includeModels || []).concat(args[++i].split(","));
    else if (args[i] === "--include-only") result.includeOnly = true;
    else if (args[i] === "--help" || args[i] === "-h") {
      console.log(
        "Usage: bun run cli.ts [--auto-merge] [--base-url <url>] [--api-key <key>] [--exclude <patterns>] [--include <patterns>] [--include-only]",
      );
      process.exit(0);
    }
  }
  return result;
}

main();
