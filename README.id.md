# omp-nine-router

Narik model dari 9Router ke OMP (Oh My Pi).

Package ini ngambil daftar model dari endpoint 9Router, ngasih enrichment dari katalog OMP (thinking levels, api protocol, pricing, reasoning), lalu nulis semuanya ke `~/.omp/agent/models.yml`. Hasilnya: OMP bisa pake 9Router dengan auto-complete, cost display, dan thinking-level selection.

## Cara install

```bash
npm add @roshitx/omp-nine-router

# atau
bun add @roshitx/omp-nine-router

# langsung pake tanpa install
npx @roshitx/omp-nine-router --help
```

## Mulai

```bash
export NINEROUTER_BASE_URL=https://ai.roshit.site/v1
export NINEROUTER_API_KEY=sk-...

npx nine-router-sync --auto-merge
```

Perintah di atas bakal narik semua model, ngasih enrichment, nulis sidecar, dan merge ke `~/.omp/agent/models.yml`.

## Fitur

- Narik 150+ model dari endpoint 9Router manapun
- Enrichment dari katalog OMP: reasoning, thinking levels, pricing, api protocol
- Combo models kaya Best, Mocin, Judge, OpenRouter-Free kecocokin pake canonical ID
- Modality disanitize (audio/video jadi text/image)
- Filter exclude/include pake glob pattern
- Atomic write: backup dulu, baru rename. Kalau gagal balik ke backup
- Dua mode: CLI dan OMP extension
- Setiap model dapet `thinking` levels dan `api` protocol sesuai schema OMP

## CLI reference

```
nine-router-sync [flags]
```

| Flag | Fungsi |
|---|---|
| `--base-url <url>` | Endpoint 9Router (default `http://localhost:20128/v1`) |
| `--api-key <key>` | Override env `NINEROUTER_API_KEY` |
| `--auto-merge` | Tulis langsung ke `~/.omp/agent/models.yml` |
| `--exclude <patterns>` | Skip model yang cocok glob, pisah pake koma. Contoh: `*/OpenRouter-Free,*/groq/*` |
| `--include <patterns>` | Glob model yang boleh ikut |
| `--include-only` | Kalau aktif, cuma model di `--include` yang kepake |
| `--help` | Tampilin bantuan |

### Contoh filter

```bash
# Skip model gratis
nine-router-sync --exclude '*/OpenRouter-Free,*/groq/*,*/free-*' --auto-merge

# Cuma model cx dan sp
nine-router-sync --include 'cx/*,sp/*' --include-only --auto-merge

# Cuma Best, Mocin, Judge
nine-router-sync --include 'Best,Mocin,Judge' --include-only --auto-merge
```

## File konfigurasi

CLI baca `~/.omp/9router.yml` kalo ada:

```yaml
baseUrl: https://ai.roshit.site/v1
apiKey: sk-...
excludeModels: "*/OpenRouter-Free,*/groq/*"
includeModels: "Best,Mocin,Judge"
includeOnly: true
```

Urutan prioritas: flag CLI > env (`NINEROUTER_BASE_URL`, `NINEROUTER_API_KEY`) > file config > default.

## Extension buat OMP

Pas OMP jalan, extension ini daftar otomatis.

**Slash command:** `/9router-sync` — sync, merge, dan panggil `registerProvider()` biar langsung kelihatan di `/models`.

**Agent tool:** `sync_9router_models` — bisa dipanggil agent. Ada parameter opsional `baseUrl`.

Cara pasang: link atau copy `src/index.ts` ke `~/.omp/agent/extensions/nine-router-sync/index.ts`.

## API programmatic

```ts
import { syncNineRouter } from "@roshitx/omp-nine-router/sync";

const result = await syncNineRouter({
  config: { baseUrl: "https://ai.roshit.site/v1" },
  autoMerge: true,
});

console.log(result.enriched); // jumlah model yang di-enrich
console.log(result.enrichedModels); // array EnrichedModel[]
```

Tipe data dari `@roshitx/omp-nine-router/types`:

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

bun run cli          # jalan dari source
bun run build        # compile ke dist/
bun run lint         # biome check
bun run typecheck    # tsc --noEmit
```

Versioning pake changesets:

```bash
bun x changeset add
bun x changeset version
npm run build && changeset publish
```

## Lisensi

MIT
