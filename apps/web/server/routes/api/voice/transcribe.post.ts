import { defineHandler } from "nitro"

import { transcribeAudioFromRequest } from "../../../../src/lib/agent-transcribe.server"

export default defineHandler(({ req }) => transcribeAudioFromRequest(req))
