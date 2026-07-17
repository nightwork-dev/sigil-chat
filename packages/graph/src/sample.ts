import type { ReducerGraphDocument } from "@workspace/graph/document"

export const sampleReducerGraph: ReducerGraphDocument = {
  schemaVersion: 1,
  id: "launch-budget",
  title: "Launch budget",
  revision: 0,
  nodes: [
    {
      id: "budget",
      reducerId: "value.number",
      label: "Total budget",
      position: { x: 70, y: 80 },
      inputValues: { value: 120 },
    },
    {
      id: "design",
      reducerId: "value.number",
      label: "Design allocation",
      position: { x: 70, y: 270 },
      inputValues: { value: 28 },
    },
    {
      id: "remaining",
      reducerId: "math.subtract",
      label: "Remaining budget",
      position: { x: 390, y: 165 },
      inputValues: { a: 0, b: 0 },
    },
    {
      id: "reserve",
      reducerId: "constraint.clamp",
      label: "Reserve envelope",
      position: { x: 720, y: 165 },
      inputValues: { value: 0, minimum: 10, maximum: 30 },
    },
  ],
  edges: [
    {
      id: "budget-to-remaining",
      sourceNodeId: "budget",
      sourceSocket: "value",
      targetNodeId: "remaining",
      targetSocket: "a",
    },
    {
      id: "design-to-remaining",
      sourceNodeId: "design",
      sourceSocket: "value",
      targetNodeId: "remaining",
      targetSocket: "b",
    },
    {
      id: "remaining-to-reserve",
      sourceNodeId: "remaining",
      sourceSocket: "difference",
      targetNodeId: "reserve",
      targetSocket: "value",
    },
  ],
}
