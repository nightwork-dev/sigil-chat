import { defineTool } from "eve/tools"
import { z } from "zod"
import { memoryDraft, memoryTurn, sigilMemoryHost } from "../lib/memory"

export default defineTool({
  description: "Remember a fact the current user explicitly asks Eve to retain.",
  inputSchema: z.object({ content: z.string().min(1).max(600) }),
  execute({ content }, ctx) {
    const principalId = ctx.session.auth.current?.principalId
    if (!principalId) throw new Error("Memory actions require an authenticated principal.")
    return sigilMemoryHost.remember(memoryTurn(ctx.session.id, principalId), memoryDraft(principalId, content))
  },
})
