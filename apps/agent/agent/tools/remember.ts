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
    "Remember a fact the current user explicitly asks Eve to retain.",
  inputSchema: z.object({ content: z.string().min(1).max(600) }),
  execute({ content }, ctx) {
    const auth = ctx.session.auth.current
    const principalId = auth?.principalId
    if (!principalId)
      throw new Error("Memory actions require an authenticated principal.")
    const personaId = sessionPersonaId(auth.attributes)
    return personaHost(personaId).remember(
      memoryTurn(ctx.session.id, principalId),
      memoryDraft(
        personaId,
        principalId,
        content,
        memoryLabelsForSession(auth.attributes, principalId),
      ),
    )
  },
})
