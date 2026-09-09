import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deepStrictEqual, strictEqual, ok } from "node:assert";
import { overlayCommandCodeModels } from "./client";
import { buildDisplayName, clearUserYmlCache, enrichModels } from "./enrichment";
import { humanizeModelName, isRawSlugName } from "./names";
import { matchModel } from "./mapper";

// ─── humanize ──────────────────────────────────────────────────────

{
  strictEqual(humanizeModelName("gcli/grok-4.5"), "Grok 4.5");
  strictEqual(humanizeModelName("grok-4.5-high"), "Grok 4.5 High");
  strictEqual(humanizeModelName("ocg/deepseek-v4-pro"), "DeepSeek V4 Pro");
  strictEqual(humanizeModelName("openai/gpt-5.4-mini"), "GPT 5.4 Mini");
  strictEqual(humanizeModelName("gc/gemini-3.1-pro-preview"), "Gemini 3.1 Pro Preview");
  strictEqual(humanizeModelName("claude-sonnet-4.6"), "Claude Sonnet 4.6");
  strictEqual(humanizeModelName("Best"), "Best");
  console.log("ok humanize");
}

// ─── raw slug detection ────────────────────────────────────────────

{
  ok(isRawSlugName("grok-4.5 (gcli)", "grok-4.5", "gcli"));
  ok(isRawSlugName("gpt-5.5 (cx) (cx) (cx)", "gpt-5.5", "cx"));
  ok(isRawSlugName("deepseek-v4-pro", "deepseek-v4-pro", "ocg"));
  ok(!isRawSlugName("Grok 4.5", "grok-4.5", "gcli"));
  ok(!isRawSlugName("GPT 5.5 (cx)", "gpt-5.5", "cx"));
  console.log("ok isRawSlugName");
}

// ─── display name idempotent ───────────────────────────────────────

{
  strictEqual(buildDisplayName("Grok 4.5", "gcli"), "Grok 4.5 (gcli)");
  strictEqual(buildDisplayName("Grok 4.5 (gcli)", "gcli"), "Grok 4.5 (gcli)");
  strictEqual(buildDisplayName("gpt-5.5 (cx) (cx)", "cx"), "gpt-5.5 (cx)");
  console.log("ok buildDisplayName");
}

// ─── live CommandCode overlay ──────────────────────────────────────

{
  const overlaid = overlayCommandCodeModels(
    [
      { id: "cmc/meituan/LongCat-2.0:free", name: "Stale LongCat", context_length: 200_000 },
      { id: "ocg/deepseek-v4-pro", context_length: 123_000 },
    ],
    [{ id: "meituan/LongCat-2.0:free", name: "LongCat 2.0", context_length: 1_048_576, pricing: { prompt: 0, completion: 0 } }],
  );
  strictEqual(overlaid[0]?.context_length, 1_048_576);
  strictEqual(overlaid[0]?.id, "cmc/meituan/LongCat-2.0:free");
  strictEqual(overlaid[0]?.name, "LongCat 2.0");
  strictEqual(overlaid[0]?.pricing?.prompt, 0);
  strictEqual(overlaid[0]?.command_code_metadata, true);
  strictEqual(overlaid[1]?.context_length, 123_000);
  console.log("ok overlayCommandCodeModels");
}

// ─── catalog match quality ─────────────────────────────────────────

{
  const grok = matchModel("grok-4.5");
  ok(grok);
  strictEqual(grok!.canonicalId, "grok-4.5");
  strictEqual(grok!.metadata.name, "Grok 4.5");
  strictEqual(grok!.metadata.contextWindow, 500_000);

  const gem = matchModel("gemini-3.1-pro-preview");
  ok(gem);
  strictEqual(gem!.metadata.contextWindow, 1_048_576);
  strictEqual(gem!.metadata.name, "Gemini 3.1 Pro");

  // must not collapse gpt-5 into gpt-5.5
  const gpt5 = matchModel("gpt-5");
  ok(gpt5);
  strictEqual(gpt5!.canonicalId, "gpt-5");

  const gpt54mini = matchModel("gpt-5.4-mini");
  ok(gpt54mini);
  strictEqual(gpt54mini!.canonicalId, "gpt-5.4-mini");

  // Sub2API nested sol/cx/... must still hit gpt-5.6 catalog
  const solXhigh = matchModel("cx/gpt-5.6-sol-xhigh");
  ok(solXhigh);
  strictEqual(solXhigh!.canonicalId, "gpt-5.6");
  strictEqual(solXhigh!.metadata.contextWindow, 1_050_000);
  console.log("ok matchModel");

  const cmcVision = matchModel("deepseek/deepseek-v4-flash-vision-exp");
  ok(cmcVision);
  strictEqual(cmcVision!.metadata.name, "DeepSeek V4 Flash Vision (exp)");
  strictEqual(cmcVision!.metadata.contextWindow, 1_000_000);
  deepStrictEqual(cmcVision!.metadata.input, ["text", "image"]);

  const cmcMuse = matchModel("meta/muse-spark-1.3");
  ok(cmcMuse);
  strictEqual(cmcMuse!.metadata.contextWindow, 1_048_576);
  deepStrictEqual(cmcMuse!.metadata.input, ["text", "image"]);

  const cmcGrok = matchModel("xai/grok-4.6");
  ok(cmcGrok);
  strictEqual(cmcGrok!.metadata.name, "Grok 4.6");
  strictEqual(cmcGrok!.metadata.contextWindow, 500_000);
}

// ─── enrich: pretty name + real context, ignore polluted yml ───────

{
  const home = mkdtempSync(join(tmpdir(), "nine-router-sync-"));
  const agentDir = join(home, ".omp", "agent");
  mkdirSync(agentDir, { recursive: true });
  writeFileSync(
    join(agentDir, "models.yml"),
    `providers:
  nine-router:
    models:
      - id: gcli/grok-4.5
        name: grok-4.5 (gcli) (gcli)
        contextWindow: 128000
        maxTokens: 16384
      - id: cx/gpt-5.5
        name: gpt-5.5 (cx) (cx) (cx)
        contextWindow: 200000
        maxTokens: 32768
`,
  );

  process.env.HOME = home;
  clearUserYmlCache();

  const result = enrichModels([
    { id: "gcli/grok-4.5" },
    { id: "gcli/grok-4.5-high" },
    { id: "cx/gpt-5.5" },
    { id: "gc/gemini-3.1-pro-preview" },
    { id: "ocg/deepseek-v4-pro" },
  ]);

  const byId = Object.fromEntries(result.enriched.map((m) => [m.id, m]));

  strictEqual(byId["gcli/grok-4.5"]?.name, "Grok 4.5 (gcli)");
  strictEqual(byId["gcli/grok-4.5"]?.contextWindow, 500_000);
  strictEqual(byId["gcli/grok-4.5"]?.maxTokens, 64_000);
  strictEqual(byId["gcli/grok-4.5"]?.enrichmentSource, "omp-catalog");

  strictEqual(byId["gcli/grok-4.5-high"]?.name, "Grok 4.5 High (gcli)");
  strictEqual(byId["gcli/grok-4.5-high"]?.contextWindow, 500_000);

  strictEqual(byId["cx/gpt-5.5"]?.name, "GPT 5.5 (cx)");
  strictEqual(byId["cx/gpt-5.5"]?.contextWindow, 1_050_000);

  strictEqual(byId["gc/gemini-3.1-pro-preview"]?.name, "Gemini 3.1 Pro Preview (gc)");
  strictEqual(byId["gc/gemini-3.1-pro-preview"]?.contextWindow, 1_048_576);

  strictEqual(byId["ocg/deepseek-v4-pro"]?.name, "DeepSeek V4 Pro (ocg)");
  strictEqual(byId["ocg/deepseek-v4-pro"]?.contextWindow, 1_048_576);

  // old regression: strip triple suffix
  clearUserYmlCache();
  const legacy = enrichModels([{ id: "cx/gpt-5.5" }]);
  strictEqual(legacy.enriched[0]?.name, "GPT 5.5 (cx)");

  // Sub2API codex sol 5.6 variants
  const sol = enrichModels([
    { id: "sol/cx/gpt-5.6-sol-xhigh" },
    { id: "sol/cx/gpt-5.6-sol-xhigh(ultra)" },
    { id: "sol/cx/gpt-5.6-sol-xhigh(max)" },
    { id: "sol/cx/gpt-5.6-terra-xhigh" },
  ]);
  const solById = Object.fromEntries(sol.enriched.map((m) => [m.id, m]));
  strictEqual(solById["sol/cx/gpt-5.6-sol-xhigh"]?.name, "GPT 5.6 XHigh Sol (sol)");
  strictEqual(solById["sol/cx/gpt-5.6-sol-xhigh"]?.contextWindow, 1_050_000);
  strictEqual(solById["sol/cx/gpt-5.6-sol-xhigh"]?.maxTokens, 128_000);
  strictEqual(solById["sol/cx/gpt-5.6-sol-xhigh"]?.enrichmentSource, "omp-catalog");
  strictEqual(solById["sol/cx/gpt-5.6-sol-xhigh(ultra)"]?.name, "GPT 5.6 XHigh Sol Ultra (sol)");
  strictEqual(solById["sol/cx/gpt-5.6-sol-xhigh(max)"]?.name, "GPT 5.6 XHigh Sol Max (sol)");
  strictEqual(solById["sol/cx/gpt-5.6-terra-xhigh"]?.name, "GPT 5.6 XHigh Terra (sol)");
  strictEqual(solById["sol/cx/gpt-5.6-terra-xhigh"]?.contextWindow, 1_050_000);


  const cmc = enrichModels([
    {
      id: "cmc/meituan/longcat-2.0:free",
      context_length: 200_000,
      pricing: { prompt: 9, completion: 9 },
    },
  ]).enriched[0];
  strictEqual(cmc?.contextWindow, 1_048_576);
  strictEqual(cmc?.cost.input, 0);
  strictEqual(cmc?.cost.output, 0);

  const fuzzyCmc = enrichModels([
    {
      id: "cmc/z-ai/glm-5.3-flash-unknown",
      context_length: 777_777,
      max_tokens: 12_345,
      pricing: { prompt: 9, completion: 10 },
    },
  ]).enriched[0];
  strictEqual(fuzzyCmc?.contextWindow, 777_777);
  strictEqual(fuzzyCmc?.maxTokens, 12_345);
  strictEqual(fuzzyCmc?.cost.input, 9);
  strictEqual(fuzzyCmc?.cost.output, 10);
  console.log("ok enrichModels");
}

console.log("all tests passed");
