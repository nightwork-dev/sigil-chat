import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Codex-backed text-to-image using the same local `codex login` session Eve
 * authenticates with. The generation call is a plain fetch and has no
 * dependency on another agent harness.
 */

const CODEX_BASE_URL = "https://chatgpt.com/backend-api";
const CODEX_RESPONSES_PATH = "/codex/responses";
const OPENAI_BETA_RESPONSES = "responses=experimental";
const CODEX_IMAGE_INSTRUCTIONS =
  "You are Codex. Use the built-in image_generation tool to generate or edit the image requested by the user. Do not answer with text instead of invoking the tool.";
// The image_generation tool is only supported on the full codex models, not
// the lightweight `-spark` tier (verified 2026-07-17: spark/5.2-codex/4o all
// 400 with "not supported"; 5.6-terra works). Override with CODEX_IMAGE_MODEL.
const DEFAULT_MODEL = "gpt-5.6-terra";

export interface GeneratedImage {
  /** Raw image bytes. */
  bytes: Uint8Array;
  /** e.g. "image/png". */
  mimeType: string;
  /** Codex may return a rewritten prompt. */
  revisedPrompt?: string;
}

interface CodexCredentials {
  accessToken: string;
  accountId: string;
}

interface CodexAuthFile {
  tokens?: {
    access_token?: string;
    account_id?: string;
  };
}

/** Read the local `codex login` token — the same session eve authenticates
 *  with. Throws a user-actionable error if the login is missing. */
async function resolveCodexCredentials(): Promise<CodexCredentials> {
  const path = process.env.CODEX_AUTH_FILE ?? join(homedir(), ".codex", "auth.json");
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch {
    throw new Error(
      `No Codex login found at ${path}. Run \`codex login\` (the same session eve uses) to enable image generation.`,
    );
  }
  const auth = JSON.parse(raw) as CodexAuthFile;
  const accessToken = auth.tokens?.access_token;
  if (!accessToken) {
    throw new Error(
      "Codex auth file has no access token. Re-run `codex login`.",
    );
  }
  const accountId =
    auth.tokens?.account_id ?? getCodexAccountId(accessToken);
  if (!accountId) {
    throw new Error(
      "Could not resolve the ChatGPT account id from the Codex OAuth token.",
    );
  }
  return { accessToken, accountId };
}

/** Extract `chatgpt_account_id` from the OAuth JWT's OpenAI auth claim. */
function getCodexAccountId(accessToken: string): string | undefined {
  try {
    const [, payload] = accessToken.split(".");
    if (!payload) return undefined;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = Buffer.from(normalized, "base64").toString("utf-8");
    const json = JSON.parse(decoded) as Record<string, unknown>;
    const auth = json["https://api.openai.com/auth"] as
      | { chatgpt_account_id?: unknown }
      | undefined;
    return typeof auth?.chatgpt_account_id === "string"
      ? auth.chatgpt_account_id
      : undefined;
  } catch {
    return undefined;
  }
}

export interface GenerateImageOptions {
  prompt: string;
  /** e.g. "1024x1024" — passed to Codex as a size hint. */
  size?: string;
  format?: "png" | "jpeg" | "webp";
  model?: string;
  signal?: AbortSignal;
}

/** Generate one image via the Codex Responses API. */
export async function generateCodexImage(
  opts: GenerateImageOptions,
): Promise<GeneratedImage> {
  if (!opts.prompt.trim()) throw new Error("prompt is required.");
  const creds = await resolveCodexCredentials();
  const format = opts.format ?? "png";
  const model = opts.model ?? process.env.CODEX_IMAGE_MODEL ?? DEFAULT_MODEL;

  const headers = new Headers();
  headers.set("Authorization", `Bearer ${creds.accessToken}`);
  headers.set("chatgpt-account-id", creds.accountId);
  headers.set("OpenAI-Beta", OPENAI_BETA_RESPONSES);
  headers.set("originator", "sigil-chat");
  headers.set("accept", "text/event-stream");
  headers.set("Content-Type", "application/json");
  headers.set("User-Agent", "sigil-chat-image-gen/0.1.0");

  const promptDetails = [
    opts.prompt.trim(),
    opts.size ? `Requested image size: ${opts.size}.` : undefined,
  ]
    .filter(Boolean)
    .join("\n");

  const body = {
    model,
    store: false,
    stream: true,
    instructions: CODEX_IMAGE_INSTRUCTIONS,
    input: [
      {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: promptDetails }],
      },
    ],
    tool_choice: "auto",
    parallel_tool_calls: false,
    tools: [{ type: "image_generation", output_format: format }],
  };

  const init: RequestInit = {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  };
  if (opts.signal) init.signal = opts.signal;

  const res = await fetch(`${CODEX_BASE_URL}${CODEX_RESPONSES_PATH}`, init);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(extractError(text) ?? `Codex image request failed (HTTP ${res.status}).`);
  }

  const call = firstImageCall(text);
  if (!call?.result) {
    throw new Error(
      "Codex response did not include an image_generation_call result.",
    );
  }
  const image: GeneratedImage = {
    bytes: new Uint8Array(Buffer.from(call.result, "base64")),
    mimeType: mimeFromFormat(format),
  };
  if (typeof call.revised_prompt === "string") {
    image.revisedPrompt = call.revised_prompt;
  }
  return image;
}

interface CodexImageCall {
  type: "image_generation_call";
  result?: string;
  revised_prompt?: string;
}

interface CodexSseEvent {
  type?: string;
  response?: { output?: unknown[]; error?: { message?: string } };
  item?: unknown;
  error?: { message?: string };
}

/** Walk the SSE stream and return the first completed image tool call. */
function firstImageCall(text: string): CodexImageCall | undefined {
  for (const event of parseSseDataBlocks(text)) {
    if (event.error?.message) throw new Error(event.error.message);
    if (event.type === "response.failed") {
      throw new Error(event.response?.error?.message ?? "Codex response failed.");
    }
    if (
      event.type === "response.output_item.done" &&
      isImageCall(event.item)
    ) {
      return event.item;
    }
    if (
      (event.type === "response.completed" || event.type === "response.done") &&
      Array.isArray(event.response?.output)
    ) {
      const found = event.response.output.find(isImageCall);
      if (found) return found;
    }
  }
  return undefined;
}

function isImageCall(item: unknown): item is CodexImageCall {
  if (!item || typeof item !== "object") return false;
  const record = item as Record<string, unknown>;
  return (
    record.type === "image_generation_call" && typeof record.result === "string"
  );
}

function parseSseDataBlocks(text: string): CodexSseEvent[] {
  const events: CodexSseEvent[] = [];
  for (const chunk of text.split(/\r?\n\r?\n/)) {
    const data = chunk
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n")
      .trim();
    if (!data || data === "[DONE]") continue;
    try {
      events.push(JSON.parse(data) as CodexSseEvent);
    } catch {
      // ignore keepalive / partial fragments
    }
  }
  return events;
}

function extractError(text: string): string | undefined {
  try {
    const json = JSON.parse(text) as {
      error?: { message?: string };
      detail?: string;
    };
    return json.error?.message ?? json.detail;
  } catch {
    return text.slice(0, 500) || undefined;
  }
}

function mimeFromFormat(format: string): string {
  if (format === "jpeg" || format === "jpg") return "image/jpeg";
  if (format === "webp") return "image/webp";
  return "image/png";
}
