import { knowledgeTools } from "@gonk/knowledge/tools";
import { tripleTools } from "@gonk/memory-tools";
import type { ToolDefinition, ToolRegistry } from "@gonk/tool-registry";

const readToolNames = new Set([
  "knowledge_query",
  "knowledge_get",
  "knowledge_links",
  "triple_query",
]);

export function registerKnowledgeTools(registry: ToolRegistry): void {
  for (const tool of [...knowledgeTools(), ...tripleTools()]) {
    registry.register(withSigilApproval(tool));
  }
}

function withSigilApproval(tool: ToolDefinition): ToolDefinition {
  return {
    ...tool,
    approval: readToolNames.has(tool.name) ? "read" : "write",
  };
}
