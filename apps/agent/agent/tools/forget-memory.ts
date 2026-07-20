import { defineTool } from "eve/tools"
import { z } from "zod"
import { memoryTurn, sigilMemoryHost } from "../lib/memory"

export default defineTool({
  description: "Forget one of the current user's accepted memories.",
  inputSchema: z.object({ recordId: z.string().min(1) }),
  execute({ recordId }, ctx) {
    const principalId = ctx.session.auth.current?.principalId
    if (!principalId) throw new Error("Memory actions require an authenticated principal.")
    return sigilMemoryHost.forget(memoryTurn(ctx.session.id, principalId), recordId)
  },
})
