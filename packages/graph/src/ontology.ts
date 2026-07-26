import { DataKind } from "@workspace/graph/data-kinds"
import {
  reduceGraphCommands,
  type GraphValue,
  type ReducerGraphCommand,
  type ReducerGraphDocument,
  type ReducerNodeDocument,
} from "@workspace/graph/document"
import { ReducerRegistry, type Reducer } from "@workspace/graph/reducer"

export type OntologyAuthority = "agent" | "user"
export type OntologyClaimStatus = "asserted" | "corrected" | "disputed"

export interface ConversationTurn {
  id: string
  role: "assistant" | "user"
  content: string
}

export interface OntologyEntityProposal {
  key: string
  label: string
  properties?: Record<string, GraphValue>
}

export interface OntologyRelationProposal {
  key: string
  subjectEntityKey: string
  predicate: string
  objectEntityKey: string
  properties?: Record<string, GraphValue>
}

export interface OntologyClaimProposal {
  key: string
  subjectEntityKey?: string
  text: string
  status?: OntologyClaimStatus
  properties?: Record<string, GraphValue>
}

export interface OntologyGraphDelta {
  entities?: OntologyEntityProposal[]
  relations?: OntologyRelationProposal[]
  claims?: OntologyClaimProposal[]
}

export interface OntologyWorkingState {
  entities: OntologyEntityState[]
  relations: OntologyRelationState[]
  claims: OntologyClaimState[]
}

export interface OntologyEntityState extends OntologyEntityProposal {
  id: string
  authority: OntologyAuthority
}

export interface OntologyRelationState extends OntologyRelationProposal {
  id: string
  authority: OntologyAuthority
}

export interface OntologyClaimState extends OntologyClaimProposal {
  id: string
  authority: OntologyAuthority
  status: OntologyClaimStatus
}

export interface GraphDeltaExtractionInput {
  priorGraph: ReducerGraphDocument
  workingState: OntologyWorkingState
  turn: ConversationTurn
}

export type GraphDeltaExtractor = (
  input: GraphDeltaExtractionInput,
) => OntologyGraphDelta | Promise<OntologyGraphDelta>

export type OntologyUserEdit =
  | {
      type: "entity.update"
      id: string
      patch: Partial<Pick<OntologyEntityProposal, "label" | "properties">>
    }
  | {
      type: "relation.update"
      id: string
      patch: Partial<
        Pick<
          OntologyRelationProposal,
          "subjectEntityKey" | "predicate" | "objectEntityKey" | "properties"
        >
      >
    }
  | {
      type: "claim.update"
      id: string
      patch: Partial<
        Pick<
          OntologyClaimProposal,
          "subjectEntityKey" | "text" | "status" | "properties"
        >
      >
    }
  | { type: "resource.remove"; id: string }

const entityReducerId = "ontology.entity"
const relationReducerId = "ontology.relation"
const claimReducerId = "ontology.claim"

export async function extractGraphDelta(
  priorGraph: ReducerGraphDocument,
  turn: ConversationTurn,
  extractor: GraphDeltaExtractor,
): Promise<OntologyGraphDelta> {
  return extractor({
    priorGraph: cloneGraph(priorGraph),
    workingState: projectOntologyWorkingState(priorGraph),
    turn: { ...turn },
  })
}

export function applyGraphDelta(
  graph: ReducerGraphDocument,
  delta: OntologyGraphDelta,
): ReducerGraphDocument {
  const commands: ReducerGraphCommand[] = []
  const availableEntityIds = new Set(
    graph.nodes
      .filter(({ reducerId }) => reducerId === entityReducerId)
      .map(({ id }) => id),
  )

  for (const entity of delta.entities ?? []) {
    const id = stableOntologyId("entity", entity.key)
    commands.push(...upsertNodeCommands(graph, entityNode(id, entity)))
    availableEntityIds.add(id)
  }

  for (const relation of delta.relations ?? []) {
    const subjectId = stableOntologyId("entity", relation.subjectEntityKey)
    const objectId = stableOntologyId("entity", relation.objectEntityKey)
    assertKnownEntity(availableEntityIds, subjectId, relation.subjectEntityKey)
    assertKnownEntity(availableEntityIds, objectId, relation.objectEntityKey)
    const id = stableOntologyId("relation", relation.key)
    if (isUserAuthoritative(graph, id)) continue
    commands.push(...upsertNodeCommands(graph, relationNode(id, relation)))
    commands.push(
      ...upsertReferenceEdgeCommands(graph, subjectId, id, "subject"),
      ...upsertReferenceEdgeCommands(graph, objectId, id, "object"),
    )
  }

  for (const claim of delta.claims ?? []) {
    const id = stableOntologyId("claim", claim.key)
    if (isUserAuthoritative(graph, id)) continue
    commands.push(...upsertNodeCommands(graph, claimNode(id, claim)))
    if (claim.subjectEntityKey) {
      const subjectId = stableOntologyId("entity", claim.subjectEntityKey)
      assertKnownEntity(
        availableEntityIds,
        subjectId,
        claim.subjectEntityKey,
      )
      commands.push(
        ...upsertReferenceEdgeCommands(graph, subjectId, id, "subject"),
      )
    }
  }

  return reduceGraphCommands(graph, commands)
}

export function reconcileUserEdit(
  graph: ReducerGraphDocument,
  edit: OntologyUserEdit,
): ReducerGraphDocument {
  const node = graph.nodes.find(({ id }) => id === edit.id)
  if (!node) throw new Error(`Ontology resource "${edit.id}" does not exist.`)

  if (edit.type === "resource.remove") {
    return reduceGraphCommands(graph, [{ type: "node.remove", id: edit.id }])
  }

  const expectedReducerId =
    edit.type === "entity.update"
      ? entityReducerId
      : edit.type === "relation.update"
        ? relationReducerId
        : claimReducerId
  if (node.reducerId !== expectedReducerId) {
    throw new Error(
      `Ontology resource "${edit.id}" is not a ${edit.type.split(".")[0]}.`,
    )
  }

  const patch = {
    ...edit.patch,
    properties: edit.patch.properties
      ? { ...readProperties(node), ...edit.patch.properties }
      : readProperties(node),
    authority: "user",
  } satisfies Record<string, GraphValue>
  const label =
    edit.type === "entity.update" && edit.patch.label !== undefined
      ? edit.patch.label
      : edit.type === "relation.update" && edit.patch.predicate !== undefined
        ? edit.patch.predicate
        : edit.type === "claim.update" && edit.patch.text !== undefined
          ? edit.patch.text
          : node.label

  const commands: ReducerGraphCommand[] = [
    {
      type: "node.update",
      id: edit.id,
      patch: { label, inputValues: patch },
    },
  ]
  if (edit.type === "relation.update") {
    const subjectKey =
      edit.patch.subjectEntityKey ??
      readString(node, "subjectEntityKey")
    const objectKey =
      edit.patch.objectEntityKey ?? readString(node, "objectEntityKey")
    commands.push(
      ...replaceReferenceEdgeCommands(
        graph,
        stableOntologyId("entity", subjectKey),
        node.id,
        "subject",
      ),
      ...replaceReferenceEdgeCommands(
        graph,
        stableOntologyId("entity", objectKey),
        node.id,
        "object",
      ),
    )
  }
  if (edit.type === "claim.update" && edit.patch.subjectEntityKey) {
    commands.push(
      ...replaceReferenceEdgeCommands(
        graph,
        stableOntologyId("entity", edit.patch.subjectEntityKey),
        node.id,
        "subject",
      ),
    )
  }

  return reduceGraphCommands(graph, commands)
}

export function projectOntologyWorkingState(
  graph: ReducerGraphDocument,
): OntologyWorkingState {
  return {
    entities: graph.nodes
      .filter(({ reducerId }) => reducerId === entityReducerId)
      .map(readEntityState),
    relations: graph.nodes
      .filter(({ reducerId }) => reducerId === relationReducerId)
      .map(readRelationState),
    claims: graph.nodes
      .filter(({ reducerId }) => reducerId === claimReducerId)
      .map(readClaimState),
  }
}

export function stableOntologyId(
  kind: "entity" | "relation" | "claim" | "edge",
  identity: string,
): string {
  const canonical = canonicalIdentity(identity)
  const slug =
    canonical
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32) || "item"
  return `ontology-${kind}-${slug}-${fnv1a(canonical)}`
}

export const ontologyReducers: Reducer[] = [
  {
    id: entityReducerId,
    name: "Ontology entity",
    description: "A stable entity in the conversation ontology.",
    inputs: [
      { name: "key", kind: DataKind.String, required: true },
      { name: "label", kind: DataKind.String, required: true },
      { name: "properties", kind: DataKind.Object },
      { name: "authority", kind: DataKind.String, required: true },
    ],
    outputs: [{ name: "reference", kind: DataKind.Object }],
    run: (inputs) => ({ reference: inputs }),
    pure: true,
  },
  {
    id: relationReducerId,
    name: "Ontology relation",
    description: "A stable directed relation between ontology entities.",
    inputs: [
      { name: "key", kind: DataKind.String, required: true },
      { name: "subjectEntityKey", kind: DataKind.String, required: true },
      { name: "predicate", kind: DataKind.String, required: true },
      { name: "objectEntityKey", kind: DataKind.String, required: true },
      { name: "properties", kind: DataKind.Object },
      { name: "authority", kind: DataKind.String, required: true },
      { name: "subject", kind: DataKind.Object, role: "context" },
      { name: "object", kind: DataKind.Object, role: "context" },
    ],
    outputs: [{ name: "reference", kind: DataKind.Object }],
    run: (inputs) => ({ reference: inputs }),
    pure: true,
  },
  {
    id: claimReducerId,
    name: "Ontology claim",
    description: "A correctable claim in the conversation ontology.",
    inputs: [
      { name: "key", kind: DataKind.String, required: true },
      { name: "subjectEntityKey", kind: DataKind.String },
      { name: "text", kind: DataKind.String, required: true },
      { name: "status", kind: DataKind.String, required: true },
      { name: "properties", kind: DataKind.Object },
      { name: "authority", kind: DataKind.String, required: true },
      { name: "subject", kind: DataKind.Object, role: "context" },
    ],
    outputs: [{ name: "reference", kind: DataKind.Object }],
    run: (inputs) => ({ reference: inputs }),
    pure: true,
  },
]

export function createOntologyReducerRegistry(): ReducerRegistry {
  const registry = new ReducerRegistry()
  ontologyReducers.forEach((reducer) => registry.register(reducer))
  return registry
}

function entityNode(
  id: string,
  entity: OntologyEntityProposal,
): ReducerNodeDocument {
  return {
    id,
    reducerId: entityReducerId,
    label: entity.label,
    position: { x: 0, y: 0 },
    inputValues: {
      key: entity.key,
      label: entity.label,
      properties: entity.properties ?? {},
      authority: "agent",
    },
  }
}

function relationNode(
  id: string,
  relation: OntologyRelationProposal,
): ReducerNodeDocument {
  return {
    id,
    reducerId: relationReducerId,
    label: relation.predicate,
    position: { x: 0, y: 0 },
    inputValues: {
      key: relation.key,
      subjectEntityKey: relation.subjectEntityKey,
      predicate: relation.predicate,
      objectEntityKey: relation.objectEntityKey,
      properties: relation.properties ?? {},
      authority: "agent",
    },
  }
}

function claimNode(
  id: string,
  claim: OntologyClaimProposal,
): ReducerNodeDocument {
  return {
    id,
    reducerId: claimReducerId,
    label: claim.text,
    position: { x: 0, y: 0 },
    inputValues: {
      key: claim.key,
      ...(claim.subjectEntityKey
        ? { subjectEntityKey: claim.subjectEntityKey }
        : {}),
      text: claim.text,
      status: claim.status ?? "asserted",
      properties: claim.properties ?? {},
      authority: "agent",
    },
  }
}

function upsertNodeCommands(
  graph: ReducerGraphDocument,
  proposed: ReducerNodeDocument,
): ReducerGraphCommand[] {
  const current = graph.nodes.find(({ id }) => id === proposed.id)
  if (!current) return [{ type: "node.add", node: proposed }]
  if (current.reducerId !== proposed.reducerId) {
    throw new Error(
      `Stable ontology id "${proposed.id}" changed resource kinds.`,
    )
  }
  if (current.inputValues.authority === "user") return []
  return [
    {
      type: "node.update",
      id: proposed.id,
      patch: {
        label: proposed.label,
        inputValues: proposed.inputValues,
      },
    },
  ]
}

function upsertReferenceEdgeCommands(
  graph: ReducerGraphDocument,
  sourceNodeId: string,
  targetNodeId: string,
  targetSocket: "subject" | "object",
): ReducerGraphCommand[] {
  const id = stableOntologyId(
    "edge",
    `${sourceNodeId}|reference|${targetNodeId}|${targetSocket}`,
  )
  const current = graph.edges.find(
    (edge) =>
      edge.targetNodeId === targetNodeId &&
      edge.targetSocket === targetSocket,
  )
  if (current?.id === id) return []
  return [
    ...(current
      ? ([{ type: "edge.remove", id: current.id }] as ReducerGraphCommand[])
      : []),
    {
      type: "edge.add",
      edge: {
        id,
        sourceNodeId,
        sourceSocket: "reference",
        targetNodeId,
        targetSocket,
      },
    },
  ]
}

function replaceReferenceEdgeCommands(
  graph: ReducerGraphDocument,
  sourceNodeId: string,
  targetNodeId: string,
  targetSocket: "subject" | "object",
): ReducerGraphCommand[] {
  if (!graph.nodes.some(({ id }) => id === sourceNodeId)) {
    throw new Error(
      `Ontology edit references unknown entity id "${sourceNodeId}".`,
    )
  }
  return upsertReferenceEdgeCommands(
    graph,
    sourceNodeId,
    targetNodeId,
    targetSocket,
  )
}

function readEntityState(node: ReducerNodeDocument): OntologyEntityState {
  return {
    id: node.id,
    key: readString(node, "key"),
    label: readString(node, "label"),
    properties: readProperties(node),
    authority: readAuthority(node),
  }
}

function readRelationState(node: ReducerNodeDocument): OntologyRelationState {
  return {
    id: node.id,
    key: readString(node, "key"),
    subjectEntityKey: readString(node, "subjectEntityKey"),
    predicate: readString(node, "predicate"),
    objectEntityKey: readString(node, "objectEntityKey"),
    properties: readProperties(node),
    authority: readAuthority(node),
  }
}

function readClaimState(node: ReducerNodeDocument): OntologyClaimState {
  const subjectEntityKey = node.inputValues.subjectEntityKey
  return {
    id: node.id,
    key: readString(node, "key"),
    ...(typeof subjectEntityKey === "string" ? { subjectEntityKey } : {}),
    text: readString(node, "text"),
    status: readClaimStatus(node),
    properties: readProperties(node),
    authority: readAuthority(node),
  }
}

function readString(node: ReducerNodeDocument, key: string): string {
  const value = node.inputValues[key]
  if (typeof value !== "string") {
    throw new Error(`Ontology node "${node.id}" has an invalid "${key}".`)
  }
  return value
}

function readProperties(
  node: ReducerNodeDocument,
): Record<string, GraphValue> {
  const value = node.inputValues.properties
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          cloneGraphValue(item),
        ]),
      )
    : {}
}

function readAuthority(node: ReducerNodeDocument): OntologyAuthority {
  return node.inputValues.authority === "user" ? "user" : "agent"
}

function readClaimStatus(node: ReducerNodeDocument): OntologyClaimStatus {
  const status = node.inputValues.status
  return status === "corrected" || status === "disputed" ? status : "asserted"
}

function assertKnownEntity(
  availableEntityIds: Set<string>,
  id: string,
  key: string,
): void {
  if (!availableEntityIds.has(id)) {
    throw new Error(`Ontology delta references unknown entity "${key}".`)
  }
}

function canonicalIdentity(value: string): string {
  const canonical = value.trim().toLocaleLowerCase("en-US")
  if (!canonical) throw new Error("Ontology identity cannot be empty.")
  return canonical
}

function cloneGraph(graph: ReducerGraphDocument): ReducerGraphDocument {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => ({
      ...node,
      position: { ...node.position },
      inputValues: Object.fromEntries(
        Object.entries(node.inputValues).map(([key, value]) => [
          key,
          cloneGraphValue(value),
        ]),
      ),
    })),
    edges: graph.edges.map((edge) => ({ ...edge })),
    viewport: graph.viewport ? { ...graph.viewport } : undefined,
  }
}

function cloneGraphValue(value: GraphValue): GraphValue {
  if (Array.isArray(value)) return value.map(cloneGraphValue)
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        cloneGraphValue(item),
      ]),
    )
  }
  return value
}

function isUserAuthoritative(
  graph: ReducerGraphDocument,
  id: string,
): boolean {
  return (
    graph.nodes.find((node) => node.id === id)?.inputValues.authority === "user"
  )
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}
