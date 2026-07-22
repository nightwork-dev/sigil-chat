// Local-dev seed for exercising product homes through the same durable stores
// and authorization paths used by the running application.

import { fileURLToPath } from "node:url"

import type { HandleMessageStreamEvent } from "eve/client"
import type { BoardView, Story } from "@workspace/work-items-store/types"
import { workItemsRepository } from "@workspace/work-items-store"

import { getProjectWorkspaceRegistries } from "../../agent/agent/lib/project-workspace-registries"
import type { ScopeLinkKind } from "../../agent/agent/lib/scope-graph"
import { getAuthDbClient } from "../src/lib/auth/server"
import {
  agentThreadBindingService,
  agentThreadRepository,
} from "../src/lib/agent-threads.server"

const SEEDED_AT = "2026-07-21T12:00:00.000Z"

if (process.env.NODE_ENV === "production") {
  throw new Error("The scope-composition seed cannot run in production.")
}

const principal = await resolvePrincipal()
const registries = getProjectWorkspaceRegistries()

ensureProject("commerce-platform", {
  name: "Commerce Platform",
  description: "Storefront, checkout, and customer purchase systems.",
  icon: "🛒",
})
ensureProject("brand", {
  name: "Brand",
  description: "Brand systems, campaigns, and customer communications.",
  icon: "✦",
})
ensureWorkspace("checkout-reliability", {
  projectId: "commerce-platform",
  name: "Checkout Reliability",
  description: "Error-budget, payment, and order-submission reliability work.",
  icon: "🧯",
})
ensureWorkspace("holiday-launch", {
  projectId: "brand",
  name: "Holiday Launch",
  description: "Holiday offers and storefront coordination.",
  icon: "🎁",
})
ensureLink("mounted-in", "holiday-launch", "commerce-platform", 0)
ensureLink("rolls-up-to", "holiday-launch", "commerce-platform", 0)
ensureInitialPerspective()

const checkoutThread = ensureThread({
  title: "Retry storm triage",
  workspaceId: "checkout-reliability",
  viaProjectId: "commerce-platform",
  events: [
    completedMessage(
      "Checkout retry behavior is mapped; payment capture remains isolated for verification.",
      "checkout-triage",
      "2026-07-21T12:10:00.000Z",
    ),
  ],
})
const holidayThread = ensureThread({
  title: "Draft Holiday Offers",
  workspaceId: "holiday-launch",
  viaProjectId: "commerce-platform",
  events: [
    completedAnnotation(
      "holiday-offer-eligibility",
      "Confirm offer eligibility before publishing the campaign catalog.",
      "Eligibility",
      "holiday-offers",
      "2026-07-21T12:20:00.000Z",
    ),
    completedMessage(
      "The first holiday offer catalog draft is ready for review.",
      "holiday-offers",
      "2026-07-21T12:21:00.000Z",
      2,
    ),
  ],
})

await ensureStory({
  id: "CP.14",
  kind: "story",
  homeScopeId: "commerce-platform",
  scopeBindings: [],
  provenance: principalProvenance(),
  revision: 1,
  epicId: "checkout-reliability",
  epicTitle: "Checkout reliability",
  title: "Split payment capture from authorization",
  intent: "Keep capture retries from repeating authorization side effects.",
  acceptanceCriteria: [
    "Capture and authorization can be retried independently.",
  ],
  status: "in-progress",
  routing: "implementation",
  reviewGate: "peer",
  deps: [],
  authoredBy: principal.name,
  createdAt: SEEDED_AT,
  updatedAt: SEEDED_AT,
})
await ensureStory({
  id: "CP.15",
  kind: "task",
  homeScopeId: "commerce-platform",
  scopeBindings: [],
  provenance: principalProvenance(),
  revision: 1,
  epicId: "checkout-reliability",
  epicTitle: "Checkout reliability",
  title: "Checkout error budget alerts",
  intent:
    "Make checkout reliability regressions visible before customers report them.",
  acceptanceCriteria: ["The checkout error budget has actionable alerts."],
  status: "ready",
  routing: "implementation",
  reviewGate: "none",
  deps: [],
  authoredBy: principal.name,
  createdAt: SEEDED_AT,
  updatedAt: SEEDED_AT,
})
await ensureStory({
  id: "CP.9",
  kind: "story",
  homeScopeId: "commerce-platform",
  scopeBindings: [],
  provenance: principalProvenance(),
  revision: 1,
  epicId: "checkout-reliability",
  epicTitle: "Checkout reliability",
  title: "Idempotent order submission",
  intent:
    "Prevent repeated checkout submissions from creating duplicate orders.",
  acceptanceCriteria: ["Repeated submissions resolve to one durable order."],
  status: "verify",
  routing: "implementation",
  reviewGate: "browser:owner",
  deps: [],
  authoredBy: principal.name,
  createdAt: SEEDED_AT,
  updatedAt: SEEDED_AT,
})
await ensureStory({
  id: "HL.3",
  kind: "story",
  homeScopeId: "holiday-launch",
  scopeBindings: [
    { scopeId: "commerce-platform", relation: "rolls-up-to" },
    { scopeId: holidayThread.id, relation: "mounted-in" },
  ],
  provenance: principalProvenance(),
  revision: 1,
  epicId: "holiday-offers",
  epicTitle: "Holiday offers",
  title: "Draft holiday offer catalog",
  intent: "Create the first reviewable set of holiday storefront offers.",
  acceptanceCriteria: ["The catalog is ready for eligibility review."],
  status: "in-progress",
  routing: "design",
  reviewGate: "peer",
  deps: [],
  authoredBy: principal.name,
  createdAt: SEEDED_AT,
  updatedAt: SEEDED_AT,
})

await ensureFeatureRequest(holidayThread.id)
await ensureBoard({
  id: "dev-commerce-roadmap",
  ownerScopeId: "commerce-platform",
  ownerPrincipalId: principal.id,
  name: "Commerce roadmap",
  visibility: "private",
  roots: ["commerce-platform"],
  traversal: "self-and-rollups",
  filters: {},
  groupBy: "status",
  revision: 1,
})
await ensureBoard({
  id: "dev-holiday-launch-board",
  ownerScopeId: "holiday-launch",
  ownerPrincipalId: principal.id,
  name: "Holiday Launch work",
  visibility: "private",
  roots: ["holiday-launch"],
  traversal: "self",
  filters: {},
  groupBy: "status",
  revision: 1,
})

await seedArtifacts(holidayThread.id)

console.log(
  `scope-composition seed complete for ${principal.email} (${principal.id})`,
)
console.log(`home: http://sigil-chat.localhost:1355/home`)
console.log(
  `project: http://sigil-chat.localhost:1355/projects/commerce-platform`,
)
console.log(
  `shared workspace: http://sigil-chat.localhost:1355/workspaces/holiday-launch?via=commerce-platform`,
)
console.log(
  `session: http://sigil-chat.localhost:1355/sessions/${holidayThread.id}?via=commerce-platform`,
)
console.log(`checkout session: ${checkoutThread.id}`)

interface SeedPrincipal {
  id: string
  email: string
  name: string
}

async function resolvePrincipal(): Promise<SeedPrincipal> {
  const requested =
    argumentValue("--principal") ??
    process.env.SIGIL_DEV_SEED_PRINCIPAL_ID?.trim()
  const client = await getAuthDbClient()
  const result = await client.execute(
    "SELECT id, email, name FROM user ORDER BY createdAt ASC",
  )
  const principals = result.rows.map((row) => ({
    id: String(row.id),
    email: String(row.email),
    name: String(row.name),
  }))
  if (principals.length === 0) {
    throw new Error(
      "No local user exists. Complete /setup or log in before seeding.",
    )
  }
  if (requested) {
    const match = principals.find((candidate) => candidate.id === requested)
    if (!match) {
      throw new Error(
        `Unknown principal ${requested}. Available principals:\n${formatPrincipals(principals)}`,
      )
    }
    return match
  }
  if (principals.length === 1) return principals[0]!
  throw new Error(
    `More than one local user exists. Pass --principal <id>:\n${formatPrincipals(principals)}`,
  )
}

function argumentValue(name: string): string | undefined {
  const exactIndex = process.argv.indexOf(name)
  if (exactIndex >= 0) return process.argv[exactIndex + 1]?.trim()
  const prefix = `${name}=`
  return process.argv
    .find((argument) => argument.startsWith(prefix))
    ?.slice(prefix.length)
    .trim()
}

function formatPrincipals(principals: readonly SeedPrincipal[]): string {
  return principals
    .map((candidate) => `- ${candidate.id} (${candidate.email})`)
    .join("\n")
}

function ensureProject(
  id: string,
  input: { name: string; description: string; icon: string },
): void {
  const existing = registries.projects.get(id)
  if (!existing) {
    registries.projects.upsert({
      id,
      ...input,
      members: [{ principalId: principal.id, role: "owner" }],
      settings: {},
      createdAt: SEEDED_AT,
      createdBy: principal.id,
    })
    return
  }
  if (existing.members.some((member) => member.principalId === principal.id))
    return
  registries.projects.upsert({
    ...existing,
    members: [
      ...existing.members,
      { principalId: principal.id, role: "owner" },
    ],
  })
}

function ensureWorkspace(
  id: string,
  input: { projectId: string; name: string; description: string; icon: string },
): void {
  if (registries.workspaces.get(id)) return
  registries.workspaces.upsert({
    id,
    ...input,
    homeScopeId: input.projectId,
    status: "active",
    createdAt: SEEDED_AT,
    createdBy: principal.id,
  })
}

function ensureLink(
  kind: ScopeLinkKind,
  subjectScopeId: string,
  targetScopeId: string,
  order: number,
): void {
  const exists = registries.links
    .list(kind)
    .some(
      (link) =>
        link.subjectScopeId === subjectScopeId &&
        link.targetScopeId === targetScopeId,
    )
  if (exists) return
  registries.links.create({
    kind,
    subjectScopeId,
    targetScopeId,
    order,
    createdBy: principal.id,
  })
}

function ensureInitialPerspective(): void {
  const preference = agentThreadRepository.getActivePreference(principal.id)
  if (preference.activePerspective) return
  agentThreadRepository.setActiveContainer(principal.id, {
    perspective: { focusScopeId: "commerce-platform", viaScopeIds: [] },
  })
}

function ensureThread(input: {
  title: string
  workspaceId: string
  viaProjectId: string
  events: HandleMessageStreamEvent[]
}) {
  const existing = agentThreadRepository
    .list(principal.id, true)
    .find(
      (thread) =>
        thread.title === input.title &&
        thread.workspaceId === input.workspaceId,
    )
  if (existing) return existing
  const created = agentThreadBindingService.create(principal.id, {
    personaId: agentThreadRepository.getDefaultPersonaId(),
    title: input.title,
    workspaceId: input.workspaceId,
    sessionKind: "workspace",
    initialPerspective: {
      focusScopeId: input.workspaceId,
      viaScopeIds: [input.viaProjectId],
    },
  })
  return agentThreadRepository.saveSnapshot(
    principal.id,
    created.id,
    { session: created.eve.session, events: input.events },
    created.revision,
  )
}

function completedMessage(
  message: string,
  turnId: string,
  at: string,
  stepIndex = 1,
): HandleMessageStreamEvent {
  return {
    type: "message.completed",
    data: { finishReason: "stop", message, sequence: 3, stepIndex, turnId },
    meta: { at },
  }
}

function completedAnnotation(
  anchorId: string,
  body: string,
  label: string,
  turnId: string,
  at: string,
): HandleMessageStreamEvent {
  return {
    type: "action.result",
    data: {
      result: {
        callId: `call-${anchorId}`,
        kind: "tool-result",
        output: { structuredContent: { data: { anchorId, body, label } } },
        toolName: "gonk__sigil-annotate",
      },
      sequence: 2,
      status: "completed",
      stepIndex: 1,
      turnId,
    },
    meta: { at },
  }
}

function principalProvenance(): Story["provenance"] {
  return {
    origin: "principal",
    actorPrincipalId: principal.id,
    createdAt: SEEDED_AT,
  }
}

async function ensureStory(story: Story): Promise<void> {
  const document = await workItemsRepository.get()
  const existing = document.stories.find(
    (candidate) => candidate.id === story.id,
  )
  if (!existing) {
    await workItemsRepository.upsertStory(story, document.revision)
    return
  }
  if (story.id !== "HL.3") return
  const sessionBinding = story.scopeBindings.find(
    (binding) => binding.scopeId === holidayThread.id,
  )
  if (
    !sessionBinding ||
    existing.scopeBindings.some(
      (binding) => binding.scopeId === sessionBinding.scopeId,
    )
  ) {
    return
  }
  await workItemsRepository.upsertStory(
    {
      ...existing,
      scopeBindings: [...existing.scopeBindings, sessionBinding],
      revision: existing.revision + 1,
      updatedAt: SEEDED_AT,
    },
    document.revision,
  )
}

async function ensureFeatureRequest(agentSessionId: string): Promise<void> {
  const document = await workItemsRepository.get()
  await workItemsRepository.proposeFeatureRequest(
    {
      title: "Offer eligibility rules spike",
      problem:
        "The holiday catalog needs explicit eligibility rules before release.",
      desiredOutcome:
        "A reviewable eligibility matrix tied to the launch workspace.",
      evidence: [
        "The agent marked eligibility as needing principal attention.",
      ],
      intendedScopeId: "holiday-launch",
      proposedSponsorPrincipalId: principal.id,
    },
    {
      actorPrincipalId: principal.id,
      agentSessionId,
      currentScopeId: "holiday-launch",
      now: SEEDED_AT,
    },
    document.revision,
  )
}

async function ensureBoard(view: BoardView): Promise<void> {
  const document = await workItemsRepository.get()
  if (document.boardViews.some((candidate) => candidate.id === view.id)) return
  await workItemsRepository.upsertBoardView(view, document.revision)
}

async function seedArtifacts(sessionId: string): Promise<void> {
  if (!process.env.SIGIL_ARTIFACT_DIR?.trim()) {
    process.env.SIGIL_ARTIFACT_DIR = fileURLToPath(
      new URL("../../gonk/.data/artifacts", import.meta.url),
    )
  }
  const { getSessionArtifactStore } =
    await import("../../gonk/src/artifact-store")
  const store = getSessionArtifactStore()
  const encoder = new TextEncoder()
  await store.putFile({
    bytes: encoder.encode(
      "# Checkout latency baseline\n\nP95: 820ms\nError budget remaining: 63%\n",
    ),
    filename: "checkout-latency-baseline.md",
    mediaType: "text/markdown",
    scope: "project:commerce-platform",
  })
  await store.putFile({
    bytes: encoder.encode(
      "# Holiday offer brief\n\nCoordinate catalog, eligibility, and storefront placement.\n",
    ),
    filename: "holiday-offer-brief.md",
    mediaType: "text/markdown",
    scope: "workspace:holiday-launch",
  })
  await store.putFile({
    bytes: encoder.encode(
      "# Offer eligibility matrix\n\n- Returning customer: review\n- New customer: review\n",
    ),
    filename: "offer-eligibility-matrix.md",
    mediaType: "text/markdown",
    scope: `session:${sessionId}`,
  })
}
