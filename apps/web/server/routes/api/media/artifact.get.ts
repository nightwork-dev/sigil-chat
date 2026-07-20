import { defineHandler } from "nitro"

import { readArtifactImageFromRequest } from "../../../../src/lib/artifact-image.server"

export default defineHandler(({ req }) => readArtifactImageFromRequest(req))
