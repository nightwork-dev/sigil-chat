import type { Schedule } from "./types"

export function alignmentDependencyId(node: Schedule): string | null {
  if (node.kind !== "vector") return null
  if (node.alignment.kind === "startOf" || node.alignment.kind === "endOf") return node.alignment.siblingId
  return null
}

export function topoSiblings(nodes: Schedule[]): Schedule[] {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const state = new Map<string, "visiting" | "done">()
  const out: Schedule[] = []

  function visit(node: Schedule) {
    const mark = state.get(node.id)
    if (mark === "done") return
    if (mark === "visiting") return
    state.set(node.id, "visiting")
    const depId = alignmentDependencyId(node)
    const dep = depId ? byId.get(depId) : undefined
    if (dep) visit(dep)
    state.set(node.id, "done")
    out.push(node)
  }

  for (const node of nodes) visit(node)
  return out
}

export function alignmentCycles(nodes: Schedule[]): string[][] {
  const ids = new Set(nodes.map((node) => node.id))
  const edges = new Map<string, string[]>()
  for (const node of nodes) {
    const depId = alignmentDependencyId(node)
    edges.set(node.id, depId && ids.has(depId) ? [depId] : [])
  }

  const indexById = new Map<string, number>()
  const lowById = new Map<string, number>()
  const stack: string[] = []
  const onStack = new Set<string>()
  const cycles: string[][] = []
  let nextIndex = 0

  function strongConnect(id: string) {
    indexById.set(id, nextIndex)
    lowById.set(id, nextIndex)
    nextIndex += 1
    stack.push(id)
    onStack.add(id)

    for (const target of edges.get(id) ?? []) {
      if (!indexById.has(target)) {
        strongConnect(target)
        lowById.set(id, Math.min(lowById.get(id)!, lowById.get(target)!))
      } else if (onStack.has(target)) {
        lowById.set(id, Math.min(lowById.get(id)!, indexById.get(target)!))
      }
    }

    if (lowById.get(id) === indexById.get(id)) {
      const component: string[] = []
      let current: string | undefined
      do {
        current = stack.pop()
        if (current === undefined) break
        onStack.delete(current)
        component.push(current)
      } while (current !== id)

      const selfLoop = component.length === 1 && (edges.get(component[0]) ?? []).includes(component[0])
      if (component.length > 1 || selfLoop) cycles.push(component.sort())
    }
  }

  for (const node of nodes) {
    if (!indexById.has(node.id)) strongConnect(node.id)
  }

  return cycles
}
