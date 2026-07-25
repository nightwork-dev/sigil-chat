import type { ReducerGraphDocument } from "@workspace/graph/document"
import type {
  ConversationTurn,
  OntologyGraphDelta,
} from "@workspace/graph/ontology"

export const ontologyFixtureGraph: ReducerGraphDocument = {
  schemaVersion: 1,
  id: "ontology-fixture",
  title: "Conversation ontology",
  revision: 0,
  nodes: [],
  edges: [],
}

export const ontologyFixtureTurn: ConversationTurn = {
  id: "turn-1",
  role: "user",
  content: "Mira works on the Atlas project. Its launch is Friday.",
}

export const ontologyFixtureDelta: OntologyGraphDelta = {
  entities: [
    { key: "person:mira", label: "Mira", properties: { kind: "person" } },
    {
      key: "project:atlas",
      label: "Atlas",
      properties: { kind: "project" },
    },
  ],
  relations: [
    {
      key: "mira-works-on-atlas",
      subjectEntityKey: "person:mira",
      predicate: "works on",
      objectEntityKey: "project:atlas",
    },
  ],
  claims: [
    {
      key: "atlas-launch-date",
      subjectEntityKey: "project:atlas",
      text: "Atlas launches on Friday.",
    },
  ],
}
