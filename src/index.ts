/**
 * 9Router Sync Extension — entry point.
 *
 * Registered as an OMP extension at:
 *   ~/.omp/agent/extensions/nine-router-sync/index.ts
 *
 * Provides:
 *   - /9router-sync slash command (manual sync + auto-merge to models.yml)
 *   - sync_9router_models tool (agent-callable)
 *
 * After sync, calls registerProvider() for immediate /models visibility,
 * and writes to models.yml for persistence across restarts.
 */
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { syncNineRouter } from "./sync";
import type { LiveModel } from "./types";

export default function nineRouterSync(pi: ExtensionAPI) {
  const { z } = pi.zod;

  pi.setLabel("9Router Sync");

  // ── Slash command: /9router-sync ──
  pi.registerCommand("9router-sync", {
    description: "Sync 9Router models to OMP config + models.yml",
    async handler(_args, ctx) {
      ctx.ui.notify("Syncing 9Router models...", "info");

      const catalog = buildLiveCatalog(ctx);
      const result = await syncNineRouter({ liveModels: catalog, autoMerge: true });

      if (result.errors.length > 0) {
        ctx.ui.notify(`9Router sync failed: ${result.errors.join("; ")}`, "error");
        return;
      }

      // Register provider at runtime for immediate /models visibility
      try {
        const models = result.enrichedModels.map((m) => ({
          id: m.id,
          name: m.name,
          reasoning: m.reasoning,
          input: m.input,
          contextWindow: m.contextWindow,
          maxTokens: m.maxTokens,
          cost: m.cost,
        }));
        pi.registerProvider("nine-router", { models });
      } catch {
        // registerProvider may not be available in all modes
      }

      let msg = `9Router sync: ${result.modelsFound} found, ${result.enriched} enriched. Merged to models.yml.`;
      if (result.diff) {
        if (result.diff.added.length) msg += ` +${result.diff.added.length} new.`;
        if (result.diff.removed.length) msg += ` -${result.diff.removed.length} removed.`;
      }
      ctx.ui.notify(msg, "info");
    },
  });

  // ── Agent tool: sync_9router_models ──
  // @ts-expect-error OMP ExtensionAPI has complex generics
  pi.registerTool({
    name: "sync_9router_models",
    label: "Sync 9Router Models",
    description: "Fetch model list from 9Router, enrich with OMP metadata, auto-merge to models.yml.",
    parameters: z.object({
      baseUrl: z.string().optional().describe("9Router base URL (default from config)"),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const catalog = buildLiveCatalog(ctx);

      const result = await syncNineRouter({
        config: params.baseUrl ? { baseUrl: params.baseUrl } : undefined,
        liveModels: catalog,
        autoMerge: true,
      });

      if (result.errors.length > 0) {
        return {
          content: [{ type: "text", text: `Sync failed: ${result.errors.join("; ")}` }],
          details: { success: false, errors: result.errors },
        };
      }

      // Register provider at runtime for immediate /models visibility
      try {
        const models = result.enrichedModels.map((m: any) => ({
          id: m.id,
          name: m.name,
          reasoning: m.reasoning,
          input: m.input,
          contextWindow: m.contextWindow,
          maxTokens: m.maxTokens,
          cost: { input: m.cost.input, output: m.cost.output },
        }));
        (pi as any).registerProvider("nine-router", { models });
      } catch {
        // registerProvider may not be available in all modes
      }

      let diffLine = "";
      if (result.diff) {
        const parts: string[] = [];
        if (result.diff.added.length) parts.push(`+${result.diff.added.length} new`);
        if (result.diff.removed.length) parts.push(`-${result.diff.removed.length} removed`);
        if (parts.length === 0) parts.push("no changes (model list identical)");
        diffLine = `Models: ${parts.join(", ")}.\n`;
      }

      return {
        content: [
          {
            type: "text",
            text:
              `9Router sync complete.\nModels found: ${result.modelsFound}\nEnriched: ${result.enriched}\nHeuristic defaults: ${result.heuristicDefaults}\n${diffLine}Merged to: ~/.omp/agent/models.yml\n\nModels available immediately in this session. Reload/restart OMP for persistence.`,
          },
        ],
        details: { success: true, enriched: result.enriched, heuristicDefaults: result.heuristicDefaults, diff: result.diff },
      };
    },
  });
}

// ── Helper: extract live catalog from extension context ──

interface ModelLike {
  id: string;
  provider: string;
  name?: string;
  contextWindow?: number;
  maxTokens?: number;
  reasoning?: boolean;
  input?: string[];
  cost?: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number };
}

function buildLiveCatalog(ctx: unknown): LiveModel[] {
  if (!ctx || typeof ctx !== "object" || !("modelRegistry" in ctx)) return [];
  const registry = ctx.modelRegistry;
  if (!registry || typeof registry !== "object" || !("getAll" in registry)) return [];
  const getAll = registry.getAll;
  if (typeof getAll !== "function") return [];

  try {
    const allModels = getAll.call(registry);
    if (!Array.isArray(allModels)) return [];
    return allModels.filter(isModelLike).map((m) => ({
      id: m.id,
      provider: m.provider,
      name: m.name,
      contextWindow: m.contextWindow,
      maxTokens: m.maxTokens,
      reasoning: m.reasoning,
      input: m.input,
      cost: m.cost,
    }));
  } catch {
    return [];
  }
}

function isModelLike(v: unknown): v is ModelLike {
  return !!v && typeof v === "object" && "id" in v && typeof (v as Record<string, unknown>).id === "string";
}
