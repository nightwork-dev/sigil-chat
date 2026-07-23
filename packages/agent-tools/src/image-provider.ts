import { readFile } from "node:fs/promises";

import { homedir } from "node:os";
import { join } from "node:path";

import {
  CodexImageProvider,
  getCodexAccountId,
  type CodexCredentials,
} from "@gonk/image-gen/codex";
import type { GeneratedImage, ImageFormat } from "@gonk/image-gen/types";

const DEFAULT_MODEL = "gpt-5.6-terra";

interface CodexAuthFile {
  tokens?: {
    access_token?: string;
    account_id?: string;
  };
}

export interface GenerateCodexImageOptions {
  prompt: string;
  size?: string;
  format?: ImageFormat;
  model?: string;
  signal?: AbortSignal;
}

/**
 * Sigil's host adapter for the published Gonk image-generation substrate.
 * The package owns the provider protocol and response parsing; this adapter
 * only supplies credentials from the same local Codex login used by Eve.
 */
export async function generateCodexImage(
  options: GenerateCodexImageOptions,
): Promise<GeneratedImage> {
  const model = options.model ?? process.env.CODEX_IMAGE_MODEL ?? DEFAULT_MODEL;
  const provider = new CodexImageProvider(
    { type: "codex", model },
    { resolveCredentials: () => resolveCodexCredentials(model) },
  );
  const result = await provider.generate({
    prompt: options.prompt,
    size: options.size,
    format: options.format,
    model,
    signal: options.signal,
  });
  const image = result.images[0];
  if (!image) {
    throw new Error("Codex image generation returned no image.");
  }
  return image;
}

async function resolveCodexCredentials(modelId: string): Promise<CodexCredentials> {
  const path =
    process.env.CODEX_AUTH_FILE ?? join(homedir(), ".codex", "auth.json");
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch {
    throw new Error(
      "No Codex login found. Run `codex login` to enable image generation.",
    );
  }

  const auth = JSON.parse(raw) as CodexAuthFile;
  const apiKey = auth.tokens?.access_token;
  if (!apiKey) {
    throw new Error("Codex auth file has no access token. Re-run `codex login`.");
  }
  const accountId = auth.tokens?.account_id ?? getCodexAccountId(apiKey);
  if (!accountId) {
    throw new Error(
      "Could not resolve the ChatGPT account id from the Codex OAuth token.",
    );
  }
  return { apiKey, accountId, modelId };
}
