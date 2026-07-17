// compress / trim / materialize / feasibility — SCHEDULE-SPEC-v2.md §7–8.

import { resolve } from "./resolve"
import { validate } from "./validate"
import type {
  CompressResult,
  MaterializeOp,
  NodeAdjustment,
  Quantum,
  Schedule,
  TrimPolicy,
  ValidationError,
  VectorSchedule,
} from "./types"

const EPS = 1e-9

type SpanTarget = "duration" | "offset"

interface SpanItem {
  key: string
  nodeId: string
  target: SpanTarget
  basis: number
  min?: number
  max?: number
  flex: number
  quantum?: Quantum
  floorOverride?: number
  blockerIds?: string[]
  autoContainer?: boolean
}

function validationErrors(tree: Schedule): ValidationError[] {
  return validate(tree)
}

function assertValid(tree: Schedule) {
  const errors = validationErrors(tree)
  if (errors.length) {
    throw new Error(`invalid schedule: ${errors.map((e) => `${e.code}(${e.nodeIds.join(",")})`).join("; ")}`)
  }
}

function findNode(tree: Schedule, id: string): Schedule | null {
  if (tree.id === id) return tree
  for (const child of tree.children) {
    const found = findNode(child, id)
    if (found) return found
  }
  return null
}

function cloneWithNode(tree: Schedule, id: string, replace: (node: Schedule) => Schedule): Schedule {
  if (tree.id === id) return replace(tree)
  return { ...tree, children: tree.children.map((child) => cloneWithNode(child, id, replace)) } as Schedule
}

function isVector(node: Schedule): node is VectorSchedule {
  return node.kind === "vector"
}

function childChains(children: Schedule[]): Schedule[][] {
  const byId = new Map(children.map((child) => [child.id, child]))
  const successor = new Map<string, string>()
  const predecessor = new Map<string, string>()

  for (const child of children) {
    if (!isVector(child)) continue

    let prev: Schedule | undefined
    if (child.alignment.kind === "endOf" && child.offset.direction === "after") {
      prev = byId.get(child.alignment.siblingId)
    } else if (child.alignment.kind === "startOf" && child.offset.direction === "before") {
      const next = byId.get(child.alignment.siblingId)
      if (next && !successor.has(child.id) && !predecessor.has(next.id)) {
        successor.set(child.id, next.id)
        predecessor.set(next.id, child.id)
      }
      continue
    }

    if (!prev || successor.has(prev.id) || predecessor.has(child.id)) continue
    successor.set(prev.id, child.id)
    predecessor.set(child.id, prev.id)
  }

  const chains: Schedule[][] = []
  const seen = new Set<string>()
  for (const child of children) {
    if (predecessor.has(child.id)) continue
    const chain: Schedule[] = []
    let cur: Schedule | undefined = child
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id)
      chain.push(cur)
      const nextId = successor.get(cur.id)
      cur = nextId ? byId.get(nextId) : undefined
    }
    chains.push(chain)
  }
  for (const child of children) if (!seen.has(child.id)) chains.push([child])
  return chains
}

function basisWindow(node: Schedule): number {
  if (node.kind === "absolute") return node.end === undefined ? 0 : Math.max(0, node.end - node.start)
  if (node.boundsMode === "auto" && node.children.length > 0) {
    return Math.max(0, ...childChains(node.children).map((chain) => windowWith(itemsForChain(chain), "basis") ?? 0))
  }
  return node.duration.basis
}

function floorBlockers(node: Schedule): string[] {
  if (!(node.boundsMode === "auto" && node.children.length > 0)) return [node.id]
  let best = 0
  let blockers: string[] = []
  for (const chain of childChains(node.children)) {
    const items = itemsForChain(chain)
    const floor = windowWith(items, "min") ?? 0
    if (floor >= best) {
      best = floor
      blockers = []
      for (const item of items) {
        const span = item.flex > 0 ? quantizedFloor(item) : item.basis
        if (span > EPS) blockers.push(...(item.blockerIds ?? [item.nodeId]))
      }
    }
  }
  return [...new Set(blockers)]
}

function itemsForChain(chain: Schedule[]): SpanItem[] {
  const out: SpanItem[] = []
  for (const node of chain) {
    if (isVector(node)) {
      out.push({ key: `${node.id}:offset`, nodeId: node.id, target: "offset", ...node.offset })
      if (node.boundsMode === "auto" && node.children.length > 0) {
        out.push({
          key: `${node.id}:duration`,
          nodeId: node.id,
          target: "duration",
          basis: basisWindow(node),
          flex: node.duration.flex,
          min: minimalWindowUnchecked(node),
          max: node.duration.max,
          quantum: node.duration.quantum,
          floorOverride: minimalWindowUnchecked(node),
          blockerIds: floorBlockers(node),
          autoContainer: true,
        })
      } else {
        out.push({ key: `${node.id}:duration`, nodeId: node.id, target: "duration", ...node.duration })
      }
    } else if (node.end !== undefined) {
      out.push({ key: `${node.id}:duration`, nodeId: node.id, target: "duration", basis: node.end - node.start, flex: 0 })
    }
  }
  return out
}

function floorFor(item: SpanItem): number {
  if (item.floorOverride !== undefined) return item.floorOverride
  if (item.min !== undefined) return item.min
  if (item.basis <= 0) return 0
  if (item.quantum) return item.quantum.unit
  return EPS
}

function discreteFailureFloorFor(item: SpanItem): number {
  if (item.floorOverride !== undefined) return quantizeUp(item.floorOverride, item.quantum)
  if (item.min !== undefined) return quantizeUp(item.min, item.quantum)
  if (item.basis <= 0) return 0
  if (item.quantum) return item.quantum.unit
  return 0
}

function ceilingFor(item: SpanItem): number | null {
  return item.max ?? null
}

function quantizeDown(value: number, quantum?: Quantum): number {
  if (!quantum) return value
  return Math.floor((value + EPS) / quantum.unit) * quantum.unit
}

function quantizeUp(value: number, quantum?: Quantum): number {
  if (!quantum) return value
  return Math.ceil((value - EPS) / quantum.unit) * quantum.unit
}

function quantizedFloor(item: SpanItem): number {
  return quantizeUp(floorFor(item), item.quantum)
}

function quantizedCeiling(item: SpanItem): number | null {
  const ceiling = ceilingFor(item)
  return ceiling === null ? null : quantizeDown(ceiling, item.quantum)
}

type ChainDistribution = { ok: true; values: Map<string, number>; report: NodeAdjustment[] } | { ok: false; deficit: number; blockers: string[] }

function distribute(items: SpanItem[], targetSpan: number): ChainDistribution {
  const basisSpan = items.reduce((sum, item) => sum + item.basis, 0)
  const shrinking = targetSpan < basisSpan
  const stretching = targetSpan > basisSpan
  if (!shrinking && !stretching) return { ok: true, values: new Map(items.map((i) => [i.key, i.basis])), report: [] }

  const floors = new Map(
    items.map((item) => [
      item.key,
      item.flex > 0 ? (targetSpan <= EPS && item.min === undefined && !item.quantum && item.basis > 0 ? item.basis : discreteFailureFloorFor(item)) : item.basis,
    ]),
  )
  const floorSum = [...floors.values()].reduce((a, b) => a + b, 0)
  if (shrinking && floorSum - targetSpan > EPS) {
    // Amended §7.3 step 5: blockers = chain members whose final (floor) value
    // is nonzero — rigid items at basis, flexible items at a nonzero floor.
    // An item frozen at floor 0 gave everything it had and is not blocking.
    const blockers: string[] = []
    for (const item of items) {
      const span = floors.get(item.key) ?? 0
      if (span > EPS) {
        for (const blocker of item.blockerIds ?? [item.nodeId]) if (!blockers.includes(blocker)) blockers.push(blocker)
      }
    }
    return { ok: false, deficit: floorSum - targetSpan, blockers }
  }

  const ceilings = new Map<string, number | null>()
  for (const item of items) ceilings.set(item.key, item.flex > 0 ? quantizedCeiling(item) : item.basis)

  const values = new Map(items.map((item) => [item.key, item.basis]))
  const flexing = new Set(items.filter((item) => item.flex > 0).map((item) => item.key))

  if (flexing.size === 0) {
    if (shrinking && basisSpan - targetSpan > EPS) {
      return { ok: false, deficit: basisSpan - targetSpan, blockers: [...new Set(items.map((item) => item.nodeId))] }
    }
    return { ok: true, values, report: [] }
  }

  while (flexing.size) {
    const current = items.reduce((sum, item) => sum + (values.get(item.key) ?? item.basis), 0)
    const delta = current - targetSpan
    if (Math.abs(delta) <= EPS) break
    if (delta < 0 && shrinking) break

    let weightSum = 0
    for (const item of items) if (flexing.has(item.key)) weightSum += item.flex * Math.max(item.basis, EPS)
    if (weightSum <= EPS) break

    let froze = false
    for (const item of items) {
      if (!flexing.has(item.key)) continue
      const weight = item.flex * Math.max(item.basis, EPS)
      const change = Math.abs(delta) * (weight / weightSum)
      const next = (values.get(item.key) ?? item.basis) + (shrinking ? -change : change)
      const limit = shrinking ? floorFor(item) : ceilingFor(item)
      if (shrinking && next <= (limit as number) + EPS) {
        values.set(item.key, limit as number)
        flexing.delete(item.key)
        froze = true
      } else if (stretching && limit !== null && next >= limit - EPS) {
        values.set(item.key, limit)
        flexing.delete(item.key)
        froze = true
      } else {
        values.set(item.key, next)
      }
    }
    if (!froze) break
  }

  const continuous = new Map(values)
  for (const item of items) {
    const value = values.get(item.key) ?? item.basis
    const q = shrinking ? quantizeDown(value, item.quantum) : quantizeUp(value, item.quantum)
    const floor = floorFor(item)
    const ceiling = ceilingFor(item)
    values.set(item.key, Math.min(ceiling ?? Number.POSITIVE_INFINITY, Math.max(floor, q)))
  }

  if (shrinking) {
    let sum = items.reduce((total, item) => total + (values.get(item.key) ?? 0), 0)
    const candidates = items
      .filter((item) => item.quantum && (values.get(item.key) ?? 0) + item.quantum.unit <= item.basis + EPS)
      .sort((a, b) => ((continuous.get(b.key) ?? 0) - (values.get(b.key) ?? 0)) - ((continuous.get(a.key) ?? 0) - (values.get(a.key) ?? 0)))
    for (const item of candidates) {
      const unit = item.quantum!.unit
      while (sum + unit <= targetSpan + EPS && (values.get(item.key) ?? 0) + unit <= item.basis + EPS) {
        values.set(item.key, (values.get(item.key) ?? 0) + unit)
        sum += unit
      }
    }
    if (sum - targetSpan > EPS) {
      return { ok: false, deficit: sum - targetSpan, blockers: [...new Set(items.map((item) => item.nodeId))] }
    }
  }

  const report = items
    .filter((item) => !item.autoContainer && Math.abs((values.get(item.key) ?? item.basis) - item.basis) > EPS)
    .map((item) => ({ nodeId: item.nodeId, target: item.target, from: item.basis, to: values.get(item.key) ?? item.basis }))
  return { ok: true, values, report }
}

function applyValues(tree: Schedule, values: Map<string, number>): Schedule {
  return {
    ...tree,
    children: tree.children.map((child) => applyValues(child, values)),
    ...(isVector(tree)
      ? {
          offset: { ...tree.offset, basis: values.get(`${tree.id}:offset`) ?? tree.offset.basis },
          duration:
            tree.boundsMode === "auto" && tree.children.length > 0
              ? tree.duration
              : { ...tree.duration, basis: values.get(`${tree.id}:duration`) ?? tree.duration.basis },
        }
      : {}),
  } as Schedule
}

export function compress(tree: Schedule, nodeId: string, targetSpan: number): CompressResult {
  assertValid(tree)
  const node = findNode(tree, nodeId)
  if (!node) throw new Error(`node not found: ${nodeId}`)

  let current = tree
  const report: NodeAdjustment[] = []
  for (const chain of childChains(node.children)) {
    const result = distribute(itemsForChain(chain), targetSpan)
    if (!result.ok) return result
    current = applyValues(current, result.values)
    for (const item of itemsForChain(chain)) {
      if (!item.autoContainer) continue
      const allocated = result.values.get(item.key)
      if (allocated === undefined) continue
      const nested = compress(current, item.nodeId, allocated)
      if (!nested.ok) return nested
      current = nested.compressed
      report.push(...nested.report)
    }
    report.push(...result.report)
  }
  return { ok: true, compressed: current, report }
}

function snap(v: number, grid: Quantum, mode: "nearest" | "floor" | "ceil"): number {
  const origin = grid.origin ?? 0
  const x = (v - origin) / grid.unit
  const n = mode === "nearest" ? Math.round(x) : mode === "floor" ? Math.floor(x + EPS) : Math.ceil(x - EPS)
  return origin + n * grid.unit
}

function signedOffset(basis: number, direction: "after" | "before"): number {
  return direction === "after" ? basis : -basis
}

function findResolvedWindow(tree: Schedule, nodeId: string): { start: number; end: number | null } {
  const resolved = resolve(tree, { currentValue: () => 0 })
  const stack = [resolved]
  while (stack.length) {
    const node = stack.pop()!
    if (node.id === nodeId) return { start: node.resolvedStart, end: node.resolvedEnd }
    stack.push(...node.children)
  }
  throw new Error(`node not found: ${nodeId}`)
}

export function trim(tree: Schedule, nodeId: string, grid: Quantum, policy: TrimPolicy): Schedule {
  assertValid(tree)
  const node = findNode(tree, nodeId)
  if (!node) throw new Error(`node not found: ${nodeId}`)
  const { start, end } = findResolvedWindow(tree, nodeId)
  const startMode = policy === "expand" ? "floor" : policy === "contract" ? "ceil" : "nearest"
  const endMode = policy === "expand" ? "ceil" : policy === "contract" ? "floor" : "nearest"
  const nextStart = snap(start, grid, startMode)
  const nextEnd = end === null ? null : snap(end, grid, endMode)

  return cloneWithNode(tree, nodeId, (n) => {
    if (n.kind === "absolute") return { ...n, start: nextStart, ...(nextEnd === null ? { end: n.end } : { end: nextEnd }) }
    const anchor = start - signedOffset(n.offset.basis, n.offset.direction)
    const delta = nextStart - anchor
    const duration = nextEnd === null ? n.duration.basis : Math.max(0, nextEnd - nextStart)
    return {
      ...n,
      offset: { ...n.offset, basis: Math.abs(delta), direction: delta < 0 ? "before" : "after" },
      duration: { ...n.duration, basis: duration },
    }
  })
}

export function materialize(template: Schedule, ops: MaterializeOp[]): Schedule {
  return ops.reduce((tree, op) => {
    if (op.kind === "trim") return trim(tree, op.nodeId, op.grid, op.policy)
    const result = compress(tree, op.nodeId, op.targetSpan)
    if (!result.ok) throw new Error(`compress failed: deficit=${result.deficit}; blockers=${result.blockers.join(",")}`)
    return result.compressed
  }, template)
}

function windowWith(items: SpanItem[], kind: "basis" | "min" | "max"): number | null {
  let sum = 0
  for (const item of items) {
    if (kind === "basis") sum += item.basis
    else if (kind === "min") sum += item.flex > 0 ? quantizedFloor(item) : item.basis
    else {
      if (item.flex > 0) {
        const max = quantizedCeiling(item)
        if (max === null) return null
        sum += max
      } else sum += item.basis
    }
  }
  return sum
}

function minimalWindowUnchecked(node: Schedule): number {
  return Math.max(0, ...childChains(node.children).map((chain) => windowWith(itemsForChain(chain), "min") ?? 0))
}

export function minimalWindow(tree: Schedule, nodeId: string): number {
  assertValid(tree)
  const node = findNode(tree, nodeId)
  if (!node) throw new Error(`node not found: ${nodeId}`)
  return Math.max(0, ...childChains(node.children).map((chain) => windowWith(itemsForChain(chain), "min") ?? 0))
}

export function maximalWindow(tree: Schedule, nodeId: string): number | null {
  assertValid(tree)
  const node = findNode(tree, nodeId)
  if (!node) throw new Error(`node not found: ${nodeId}`)
  let max = 0
  for (const chain of childChains(node.children)) {
    const w = windowWith(itemsForChain(chain), "max")
    if (w === null) return null
    max = Math.max(max, w)
  }
  return max
}
