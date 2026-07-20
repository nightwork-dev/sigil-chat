import { defineTool } from "eve/tools"
import { z } from "zod"
import { memoryTurn, personaHost, sessionPersonaId } from "../lib/memory"

export default defineTool({
  description: "Forget one of the current user's accepted memories.",
  inputSchema: z.object({ recordId: z.string().min(1) }),
  execute({ recordId }, ctx) {
    const auth = ctx.session.auth.current
    const principalId = auth?.principalId
    if (!principalId)
      throw new Error("Memory actions require an authenticated principal.")
    return personaHost(sessionPersonaId(auth.attributes)).forget(
      memoryTurn(ctx.session.id, principalId),
      recordId,
    )
  },
})
