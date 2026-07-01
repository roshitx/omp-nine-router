/**
 * Extract model metadata from models.yml — synchronous regex parsing. Pure TS, no deps.
 */
import { existsSync, readFileSync } from "node:fs";
import type { LiveModel } from "./types";

export function parseModelsYml(path: string): LiveModel[] {
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, "utf-8");

  const match = raw.match(/\n {2}(?:9router|nine-router):\n([\s\S]*?)(?=\n {2}\w|$)/);
  if (!match) return [];

  const models: LiveModel[] = [];
  const chunks = match[1].split(/\n {6}- id: ?/);
  for (let i = 1; i < chunks.length; i++) {
    const chunk = chunks[i];
    const nl = chunk.indexOf("\n");
    const id = nl === -1 ? chunk.trim() : chunk.slice(0, nl).trim();
    if (!id) continue;
    models.push({
      id,
      provider: "nine-router",
      name: reField(chunk, "name"),
      contextWindow: reInt(chunk, "contextWindow"),
      maxTokens: reInt(chunk, "maxTokens"),
      reasoning: reBool(chunk, "reasoning"),
      input: reList(chunk, "input:"),
      api: reField(chunk, "api"),
    });
  }
  return models;
}

function reField(block: string, key: string): string | undefined {
  const m = block.match(new RegExp(`^\\s*${key}:\\s*"?([^"\\n]+)"?`, "m"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : undefined;
}
function reInt(block: string, key: string): number | undefined {
  const v = reField(block, key);
  return v ? parseInt(v, 10) || undefined : undefined;
}
function reBool(block: string, key: string): boolean | undefined {
  const v = reField(block, key);
  if (v === "true") return true;
  if (v === "false") return false;
  return undefined;
}
function reList(block: string, key: string): string[] | undefined {
  const inline = block.match(new RegExp(`^\\s*${key}\\s*\\[([^\\]]*)\\]`, "m"));
  if (inline)
    return inline[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  const m = block.match(new RegExp(`\\s*${key}\\s*\\n((?:\\s*- .+\\n?)*)`, "m"));
  if (!m) return undefined;
  const items: string[] = [];
  for (const line of m[1].split("\n")) {
    const item = line.match(/^\s*-\s+(.+)/);
    if (item) items.push(item[1].trim());
  }
  return items.length > 0 ? items : undefined;
}
