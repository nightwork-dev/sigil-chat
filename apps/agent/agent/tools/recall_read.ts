import { defineTool } from "eve/tools"
import { z } from "zod"
import { memoryTurn, personaHost, sessionPersonaId } from "../lib/memory"

export default defineTool({
  description:
    "Recall accepted durable memories relevant to a query. Results are read-only and filtered for the authenticated session.",
  inputSchema: z.object({
    query: z.string().min(1),
    limit: z.number().int().min(0).max(20).optional(),
  }),
  execute({ query, limit }, ctx) {
    const auth = ctx.session.auth.current
    const principalId = auth?.principalId
    if (!principalId)
      throw new Error("Memory recall requires an authenticated principal.")
    const result = personaHost(sessionPersonaId(auth.attributes)).recall(
      memoryTurn(ctx.session.id, principalId),
      { query, limit },
    )
    const matches = result.disclosure.filter(
      (match) => match.disclosure.allowed,
    )
    return {
      ok: true,
      matches,
      count: matches.length,
      receipt: result.receipt,
    }
  },
})
