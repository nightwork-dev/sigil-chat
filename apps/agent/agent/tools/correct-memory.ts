import { defineTool } from "eve/tools"
import { z } from "zod"
import { memoryDraft, memoryTurn, sigilMemoryHost } from "../lib/memory"

export default defineTool({
  description: "Correct one of the current user's accepted memories, superseding the old record.",
  inputSchema: z.object({ recordId: z.string().min(1), content: z.string().min(1).max(600) }),
  execute({ recordId, content }, ctx) {
    const principalId = ctx.session.auth.current?.principalId
    if (!principalId) throw new Error("Memory actions require an authenticated principal.")
    return sigilMemoryHost.correct(memoryTurn(ctx.session.id, principalId), recordId, memoryDraft(principalId, content))
  },
})
