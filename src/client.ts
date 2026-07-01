/**
 * 9Router API client — fetches /v1/models with tolerant parsing.
 *
 * Handles both rich and bare response shapes:
 * - { object: "list", data: [...] }
 * - [ ... ]
 * - Any additional metadata fields per model entry
 */
import type { NineRouterModel, NineRouterModelsResponse } from "./types";

export interface FetchResult {
  models: NineRouterModel[];
  rawShape: "openai-list" | "bare-array" | "unknown";
  rawKeys: string[];
  errors: string[];
}

export async function fetchModels(baseUrl: string, apiKey: string): Promise<FetchResult> {
  const errors: string[] = [];
  const url = normalizeUrl(baseUrl);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e: any) {
    return {
      models: [],
      rawShape: "unknown",
      rawKeys: [],
      errors: [`Fetch failed: ${e.message}`],
    };
  }

  if (!response.ok) {
    let body = "";
    try {
      body = await response.text();
    } catch {
      /* ignore */
    }
    return {
      models: [],
      rawShape: "unknown",
      rawKeys: [],
      errors: [`HTTP ${response.status}: ${body.slice(0, 200)}`],
    };
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch (e: any) {
    return {
      models: [],
      rawShape: "unknown",
      rawKeys: [],
      errors: [`JSON parse failed: ${e.message}`],
    };
  }

  return parseModelsResponse(json);
}

function parseModelsResponse(json: unknown): FetchResult {
  if (!json || typeof json !== "object") {
    return { models: [], rawShape: "unknown", rawKeys: [], errors: ["Response is not an object"] };
  }

  // Case 1: { object: "list", data: [...] } — standard OpenAI shape
  if ("data" in json && Array.isArray((json as any).data)) {
    const models = (json as NineRouterModelsResponse).data;
    return {
      models,
      rawShape: "openai-list",
      rawKeys: Object.keys(json as object),
      errors: [],
    };
  }

  // Case 2: bare array
  if (Array.isArray(json)) {
    return {
      models: json as NineRouterModel[],
      rawShape: "bare-array",
      rawKeys: [],
      errors: [],
    };
  }

  // Case 3: unknown
  return {
    models: [],
    rawShape: "unknown",
    rawKeys: Object.keys(json as object),
    errors: [`Unrecognized response shape. Keys: ${Object.keys(json as object).join(", ")}`],
  };
}

function normalizeUrl(url: string): string {
  let u = url.trim().replace(/\/+$/, "");
  if (!u.endsWith("/v1")) u = `${u}/v1`;
  return `${u}/models`;
}

/** Quick endpoint health check: returns { ok } or { ok: false, error } */
export async function checkEndpoint(
  baseUrl: string,
  apiKey: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const url = normalizeUrl(baseUrl);
  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      let body = "";
      try { body = await response.text(); } catch { /* ignore */ }
      return { ok: false, error: `Endpoint returned HTTP ${response.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: `Cannot reach endpoint: ${e.message}` };
  }
}
