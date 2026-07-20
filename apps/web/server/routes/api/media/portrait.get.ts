import { defineHandler } from "nitro"

import { readAgentPortraitFromRequest } from "../../../../src/lib/agent-portrait.server"

export default defineHandler(({ req }) => readAgentPortraitFromRequest(req))
