/**
 * Shape Semantics — maps visual geometry to computational behavior.
 *
 * This is the core innovation from Synapse Canvas. Each shape type has an
 * intrinsic computational meaning derived from its visual properties:
 *
 *   Rectangle → Constant    (holds a value)
 *   Ellipse   → Oscillator  (cyclical, width=frequency, height=amplitude)
 *   Triangle  → Comparator  (sharp end = direction of judgment)
 *   Star      → Aggregator  (points converge on center)
 *   Arrow     → Router      (directional flow)
 *   Text      → String      (the content IS the data)
 *   Pen       → Signal Path (input flows through the drawn path)
 *   Path      → Function    (x → y mapping along the curve)
 *   Laser     → Pulse       (temporary, fades)
 *   Group     → Subgraph    (composite behavior)
 *
 * Socket positions are computed from shape geometry — not arbitrary.
 * Visual properties map to execution parameters.
 */

import type { ShapeType, Position, Size } from "@workspace/graph/types"
import { DataKind } from "@workspace/graph/data-kinds"
import type { SocketDefinition } from "@workspace/graph/socket"

export interface ShapeSemantics {
  name: string
  reducer: string
  sockets: (SocketDefinition & { direction: "input" | "output" })[]
  defaultData?: Record<string, unknown>
  description: string
  propertyMapping?: {
    width?: string
    height?: string
    rotation?: string
  }
}

export const SHAPE_SEMANTICS: Record<ShapeType, ShapeSemantics> = {
  rect: {
    name: "Constant",
    reducer: "constant",
    sockets: [
      { name: "value", kind: DataKind.Number, direction: "output" },
    ],
    defaultData: { value: 1.0 },
    description: "Outputs a constant value. Rectangle area determines the value.",
    propertyMapping: { width: "value", height: "value" },
  },
  ellipse: {
    name: "Oscillator",
    reducer: "oscillator",
    sockets: [
      { name: "frequency", kind: DataKind.Number, direction: "input", defaultValue: 1.0 },
      { name: "amplitude", kind: DataKind.Number, direction: "input", defaultValue: 1.0 },
      { name: "value", kind: DataKind.Number, direction: "output" },
    ],
    defaultData: { phase: 0 },
    description: "Generates oscillating values. Eccentricity affects frequency.",
    propertyMapping: { width: "frequency", height: "amplitude" },
  },
  triangle: {
    name: "Comparator",
    reducer: "compare",
    sockets: [
      { name: "a", kind: DataKind.Number, direction: "input" },
      { name: "b", kind: DataKind.Number, direction: "input" },
      { name: "greater", kind: DataKind.Boolean, direction: "output" },
      { name: "equal", kind: DataKind.Boolean, direction: "output" },
      { name: "less", kind: DataKind.Boolean, direction: "output" },
    ],
    description: "Compares two values. Triangle points toward greater value.",
  },
  star: {
    name: "Aggregator",
    reducer: "aggregate",
    sockets: [
      { name: "values", kind: DataKind.NumberArray, direction: "input", multiple: true },
      { name: "sum", kind: DataKind.Number, direction: "output" },
      { name: "average", kind: DataKind.Number, direction: "output" },
      { name: "min", kind: DataKind.Number, direction: "output" },
      { name: "max", kind: DataKind.Number, direction: "output" },
    ],
    description: "Aggregates multiple values. Star points represent array values.",
  },
  arrow: {
    name: "Router",
    reducer: "router",
    sockets: [
      { name: "value", kind: DataKind.Any, direction: "input" },
      { name: "condition", kind: DataKind.Boolean, direction: "input" },
      { name: "true", kind: DataKind.Any, direction: "output" },
      { name: "false", kind: DataKind.Any, direction: "output" },
    ],
    description: "Routes values based on condition. Arrow direction shows flow.",
    propertyMapping: { rotation: "direction" },
  },
  text: {
    name: "String",
    reducer: "string",
    sockets: [
      { name: "format", kind: DataKind.String, direction: "input" },
      { name: "text", kind: DataKind.String, direction: "output" },
    ],
    description: "Text content becomes the string value.",
  },
  pen: {
    name: "Signal Path",
    reducer: "signal",
    sockets: [
      { name: "input", kind: DataKind.Number, direction: "input" },
      { name: "output", kind: DataKind.Number, direction: "output" },
    ],
    description: "Path shape modulates signal. Path complexity affects processing.",
  },
  path: {
    name: "Function",
    reducer: "function",
    sockets: [
      { name: "x", kind: DataKind.Number, direction: "input" },
      { name: "y", kind: DataKind.Number, direction: "output" },
    ],
    description: "Path defines a mathematical function.",
  },
  laser: {
    name: "Pulse",
    reducer: "pulse",
    sockets: [
      { name: "trigger", kind: DataKind.Boolean, direction: "input" },
      { name: "pulse", kind: DataKind.Boolean, direction: "output" },
    ],
    description: "Temporary pulse generator. Fades like laser pointer.",
  },
  group: {
    name: "Subgraph",
    reducer: "subgraph",
    sockets: [],
    description: "Group becomes a subgraph with composite behavior.",
  },
}

/** Can this shape type be promoted to a node? */
export function canPromote(shapeType: ShapeType): boolean {
  return shapeType !== "group" && shapeType !== "laser"
}

/** Extract initial node data from shape properties */
export function extractNodeData(
  shape: { type: ShapeType; width: number; height: number; text?: string; rotation?: number },
): Record<string, unknown> {
  const semantics = SHAPE_SEMANTICS[shape.type]
  const data: Record<string, unknown> = { ...semantics.defaultData }

  switch (shape.type) {
    case "rect":
      data.value = (shape.width * shape.height) / 10000
      break
    case "ellipse": {
      const eccentricity = Math.abs(shape.width - shape.height) / Math.max(shape.width, shape.height)
      data.frequency = 1 + eccentricity * 5
      data.amplitude = Math.min(shape.width, shape.height) / 100
      break
    }
    case "text":
      data.value = shape.text ?? ""
      break
    case "arrow":
      data.preferTrue = shape.rotation ? Math.cos((shape.rotation * Math.PI) / 180) > 0 : true
      break
  }

  return data
}

/** Socket position on a shape, computed from geometry */
export interface SocketPosition {
  socket: SocketDefinition & { direction: "input" | "output" }
  position: Position
  angle: number
}

/** Compute socket positions based on shape geometry */
export function computeSocketPositions(
  shape: { type: ShapeType } & Size,
  sockets: ShapeSemantics["sockets"],
): SocketPosition[] {
  const positions: SocketPosition[] = []
  const inputs = sockets.filter((s) => s.direction === "input")
  const outputs = sockets.filter((s) => s.direction === "output")

  switch (shape.type) {
    case "rect": {
      // Inputs left, outputs right
      inputs.forEach((socket, i) => {
        const y = shape.height * ((i + 1) / (inputs.length + 1))
        positions.push({ socket, position: { x: 0, y }, angle: Math.PI })
      })
      outputs.forEach((socket, i) => {
        const y = shape.height * ((i + 1) / (outputs.length + 1))
        positions.push({ socket, position: { x: shape.width, y }, angle: 0 })
      })
      break
    }
    case "ellipse": {
      // Distribute around ellipse arcs
      const rx = shape.width / 2
      const ry = shape.height / 2
      const cx = rx
      const cy = ry
      inputs.forEach((socket, i) => {
        const a = Math.PI + (Math.PI * i) / Math.max(1, inputs.length - 1)
        positions.push({ socket, position: { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) }, angle: a + Math.PI })
      })
      outputs.forEach((socket, i) => {
        const a = (Math.PI * i) / Math.max(1, outputs.length - 1)
        positions.push({ socket, position: { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) }, angle: a })
      })
      break
    }
    case "triangle": {
      // Inputs at base corners, outputs at apex
      if (inputs.length >= 2) {
        positions.push({ socket: inputs[0], position: { x: 0, y: shape.height }, angle: (Math.PI * 3) / 4 })
        positions.push({ socket: inputs[1], position: { x: shape.width, y: shape.height }, angle: Math.PI / 4 })
      }
      outputs.forEach((socket, i) => {
        const x = shape.width * ((i + 1) / (outputs.length + 1))
        positions.push({ socket, position: { x, y: 0 }, angle: -Math.PI / 2 })
      })
      break
    }
    case "star": {
      // Inputs on inner points, outputs on outer points
      const numPoints = 5
      const inner = Math.min(shape.width, shape.height) * 0.3
      const outer = Math.min(shape.width, shape.height) * 0.5
      const cx = shape.width / 2
      const cy = shape.height / 2
      inputs.forEach((socket, i) => {
        const a = ((2 * Math.PI) / numPoints) * i - Math.PI / 2
        positions.push({ socket, position: { x: cx + inner * Math.cos(a), y: cy + inner * Math.sin(a) }, angle: a })
      })
      outputs.forEach((socket, i) => {
        const a = ((2 * Math.PI) / numPoints) * i
        positions.push({ socket, position: { x: cx + outer * Math.cos(a), y: cy + outer * Math.sin(a) }, angle: a })
      })
      break
    }
    default: {
      // Default: inputs left, outputs right
      inputs.forEach((socket, i) => {
        const y = shape.height * ((i + 1) / (inputs.length + 1))
        positions.push({ socket, position: { x: 0, y }, angle: Math.PI })
      })
      outputs.forEach((socket, i) => {
        const y = shape.height * ((i + 1) / (outputs.length + 1))
        positions.push({ socket, position: { x: shape.width, y }, angle: 0 })
      })
    }
  }

  return positions
}
