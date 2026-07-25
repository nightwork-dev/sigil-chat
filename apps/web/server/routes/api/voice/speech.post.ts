import { defineHandler } from "nitro"

import { synthesizeSpeechFromRequest } from "../../../../src/lib/agent-voice.server"

export default defineHandler(({ req }) => synthesizeSpeechFromRequest(req))
