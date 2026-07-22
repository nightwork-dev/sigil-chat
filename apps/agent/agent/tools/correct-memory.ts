import { defineTool } from "eve/tools"
import { z } from "zod"
import {
  memoryDraft,
  memoryLabelsForSession,
  memoryTurn,
  personaHost,
  sessionPersonaId,
} from "../lib/memory"

export default defineTool({
  description:
    "Correct one of the current user's accepted memories, superseding the old record.",
  inputSchema: z.object({
    recordId: z.string().min(1),
    content: z.string().min(1).max(600),
  }),
  execute({ recordId, content }, ctx) {
    const auth = ctx.session.auth.current
    const principalId = auth?.principalId
    if (!principalId)
      throw new Error("Memory actions require an authenticated principal.")
    const personaId = sessionPersonaId(auth.attributes)
    return personaHost(personaId).correct(
      memoryTurn(ctx.session.id, principalId),
      recordId,
      memoryDraft(
        personaId,
        principalId,
        content,
        memoryLabelsForSession(auth.attributes, principalId),
      ),
    )
  },
})
