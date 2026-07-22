import { readOptionalSecretFromFile } from "@workspace/runtime-env/server"

export function readAgentSessionBindingSecret(
  source: NodeJS.ProcessEnv = process.env,
): string {
  const secret = readOptionalSecretFromFile(source, "GONK_MCP_KEY")
  if (!secret) throw new Error("Agent session binding is unavailable.")
  return secret
}
