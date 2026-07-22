import { ToolCall } from "@workspace/ui/components/tool-call"
import {
  registerToolRenderer,
  setDefaultToolRenderer,
} from "@workspace/ui/components/tool-renderer-registry"

import { DistilledArtifactCard } from "@/components/agent/distilled-artifact-card"
import { EvidenceCitationsRenderer } from "@/components/agent/evidence-citations-renderer"
import { GenerateImageRenderer } from "@/components/agent/image-tool-renderer"
import {
  SandboxActivityRenderer,
  SubagentActivityRenderer,
  TodoActivityRenderer,
  WebResearchRenderer,
} from "@/components/agent/work-activity-renderers"

setDefaultToolRenderer(ToolCall)
registerToolRenderer("sigil-generate-image", GenerateImageRenderer)
registerToolRenderer("sigil-distill", DistilledArtifactCard)
registerToolRenderer("sigil-evidence-ask", EvidenceCitationsRenderer)
registerToolRenderer("todo", TodoActivityRenderer)
registerToolRenderer("bash", SandboxActivityRenderer)
registerToolRenderer("read_file", SandboxActivityRenderer)
registerToolRenderer("write_file", SandboxActivityRenderer)
registerToolRenderer("glob", SandboxActivityRenderer)
registerToolRenderer("grep", SandboxActivityRenderer)
registerToolRenderer("web_fetch", WebResearchRenderer)
registerToolRenderer("web_search", WebResearchRenderer)
registerToolRenderer("kind:subagent-call", SubagentActivityRenderer)
