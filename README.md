# omp-nine-router

Sync 9Router models into OMP (Oh My Pi).

`@roshitx/omp-nine-router` fetches the model list from a 9Router endpoint, enriches each model with catalog metadata (thinking levels, api protocol, pricing, reasoning flags), and writes everything into `~/.omp/agent/models.yml`. You get auto-complete, cost display, and thinking-level selection for all 9Router models inside OMP.

## Install

```bash
npm add @roshitx/omp-nine-router

# or
bun add @roshitx/omp-nine-router

# or run directly
npx @roshitx/omp-nine-router --help
```

## Quick start

```bash
export NINEROUTER_BASE_URL=https://ai.roshit.site/v1
export NINEROUTER_API_KEY=sk-...

npx nine-router-sync --auto-merge
```

This fetches all models, enriches them, writes sidecar + merges into `~/.omp/agent/models.yml`.

## Features

- Fetches 150+ models from any 9Router endpoint
- Enriches with OMP catalog: reasoning flags, thinking levels, pricing, api protocol
- Combo models (Best, Mocin, Judge, OpenRouter-Free, etc.) get matched by canonical ID
- Sanitizes unsupported modalities (audio/video → text/image)
- Exclude/include model filters with glob patterns
- Atomic write with rollback on failure (backup → write tmp → rename)
- Dual interface: CLI tool + OMP extension
- Per-model `thinking` levels and `api` protocol for OMP schema

## CLI reference

```
nine-router-sync [flags]
```

| Flag | Description |
|---|---|
| `--base-url <url>` | 9Router endpoint (default: `http://localhost:20128/v1`) |
| `--api-key <key>` | Overrides `NINEROUTER_API_KEY` env |
| `--auto-merge` | Write directly into `~/.omp/agent/models.yml` |
| `--exclude <patterns>` | Comma-separated globs to skip, e.g. `*/OpenRouter-Free,*/groq/*` |
| `--include <patterns>` | Comma-separated globs to allow |
| `--include-only` | When set, only matching `--include` models survive |
| `--help` | Show usage |

### Filter examples

```bash
# Skip free models
nine-router-sync --exclude '*/OpenRouter-Free,*/groq/*,*/free-*' --auto-merge

# Only keep cx and sp models
nine-router-sync --include 'cx/*,sp/*' --include-only --auto-merge

# Keep Best, Mocin, Judge
nine-router-sync --include 'Best,Mocin,Judge' --include-only --auto-merge
```

## Configuration file

The CLI reads `~/.omp/9router.yml` if it exists.

```yaml
baseUrl: https://ai.roshit.site/v1
apiKey: sk-...
excludeModels: "*/OpenRouter-Free,*/groq/*"
includeModels: "Best,Mocin,Judge"
includeOnly: true
```

Resolution order: CLI flags > env vars (`NINEROUTER_BASE_URL`, `NINEROUTER_API_KEY`) > config file > defaults.

## OMP Extension

If you run OMP, the extension registers at startup.

**Slash command:** `/9router-sync` — syncs and merges models, then calls `registerProvider()` for immediate visibility.

**Agent tool:** `sync_9router_models` — callable from agents. Supports optional `baseUrl` parameter.

To install: copy or link `src/index.ts` to `~/.omp/agent/extensions/nine-router-sync/index.ts`.

## Programmatic API

```ts
import { syncNineRouter } from "@roshitx/omp-nine-router/sync";

const result = await syncNineRouter({
  config: { baseUrl: "https://ai.roshit.site/v1" },
  autoMerge: true,
});

console.log(result.enriched); // number of enriched models
console.log(result.enrichedModels); // full EnrichedModel[]
```

Key types exported from `@roshitx/omp-nine-router/types`:

```ts
interface EnrichedModel {
  id: string;
  name: string;
  canonicalId?: string;
  contextWindow: number;
  maxTokens: number;
  input: ("text" | "image")[];
  reasoning: boolean;
  thinking?: string[];
  api: string;
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
  enrichmentSource: "9router-metadata" | "omp-catalog" | "user-models-yml" | "heuristic";
}
```

## Development

```bash
git clone https://github.com/roshitx/omp-nine-router
cd omp-nine-router
bun install

bun run cli          # run from source
bun run build        # compile to dist/
bun run lint         # biome check
bun run typecheck    # tsc --noEmit
```

Changesets for versioning:

```bash
bun x changeset add
bun x changeset version
npm run build && changeset publish
```

## License

MIT
