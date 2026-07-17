// Conformance runner — SCHEDULE-SPEC-v2.md §12 (normative corpus).
// Discovers JSON fixtures under fixtures/**/*.json and asserts engine output.
// Fixture format is documented in ./README.md; every fixture cites the spec
// section that governs its expected output.

import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import { normalizeSchedule } from "../schedule/normalize"
import { validate } from "../schedule/validate"
import { resolve } from "../schedule/resolve"
import { compress, trim, minimalWindow, maximalWindow } from "../schedule/operators"
import { instancesOf } from "../schedule/occurrences"
import type {
  OccurrenceOverride,
  OccurrenceOverrides,
  ResolvedSchedule,
  Schedule,
  TimeContext,
  TimeContextProvider,
} from "../schedule/types"

const FIXTURES_DIR = join(fileURLToPath(new URL(".", import.meta.url)), "fixtures")

interface Fixture {
  kind: "resolve" | "validate" | "compress" | "trim" | "instances" | "feasibility"
  spec: string
  description?: string
  tree: Schedule
  /** Keyed wallClock | turnCount | gameTick | narrativeTime:<worldId> | custom:<domain>. */
  currentValues?: Record<string, number>
  op?: {
    nodeId?: string
    targetSpan?: number
    grid?: { unit: number; mode: "nearest" | "floor" | "ceil"; origin?: number }
    policy?: "nearest" | "expand" | "contract"
    rangeStart?: number
    rangeEnd?: number
    overrides?: Record<string, OccurrenceOverride>
  }
  expect: Record<string, unknown>
}

function contextKey(ctx: TimeContext): string {
  switch (ctx.kind) {
    case "narrativeTime":
      return `narrativeTime:${ctx.worldId}`
    case "custom":
      return `custom:${ctx.domain}`
    case "gameTick":
      return "gameTick"
    default:
      return ctx.kind
  }
}

function providerFrom(currentValues: Record<string, number> = {}): TimeContextProvider {
  return {
    currentValue(ctx) {
      const key = contextKey(ctx)
      const v = currentValues[key]
      if (v === undefined) throw new Error(`fixture missing currentValues["${key}"]`)
      return v
    },
  }
}

function overridesFrom(obj: Record<string, OccurrenceOverride> = {}): OccurrenceOverrides {
  return new Map(Object.entries(obj))
}

/** Index a resolved tree by node id. */
function indexResolved(root: ResolvedSchedule, into = new Map<string, ResolvedSchedule>()): Map<string, ResolvedSchedule> {
  into.set(root.id, root)
  for (const c of root.children) indexResolved(c, into)
  return into
}

/** Index a schedule tree by node id. */
function indexTree(root: Schedule, into = new Map<string, Schedule>()): Map<string, Schedule> {
  into.set(root.id, root)
  for (const c of root.children) indexTree(c, into)
  return into
}

/**
 * Subset-match: every node listed in `expected.nodes` must exist, and every
 * field listed on it must equal the resolved value. Fields not listed are not
 * checked — fixtures assert exactly what their spec section governs.
 */
function checkResolvedNodes(resolved: ResolvedSchedule, nodes: Record<string, Record<string, unknown>>) {
  const byId = indexResolved(resolved)
  for (const [id, fields] of Object.entries(nodes)) {
    const node = byId.get(id)
    expect(node, `expected node "${id}" in resolved tree`).toBeDefined()
    for (const [field, want] of Object.entries(fields)) {
      expect((node as unknown as Record<string, unknown>)[field], `${id}.${field}`).toEqual(want)
    }
  }
}

function listFixtures(dir: string): string[] {
  let out: string[] = []
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) out = out.concat(listFixtures(p))
    else if (entry.endsWith(".json")) out.push(p)
  }
  return out
}

const files = listFixtures(FIXTURES_DIR)

describe("conformance corpus", () => {
  it("has fixtures (the corpus is normative — spec §12)", () => {
    expect(files.length).toBeGreaterThan(0)
  })

  for (const file of files) {
    const name = relative(FIXTURES_DIR, file)
    const fixture = JSON.parse(readFileSync(file, "utf8")) as Fixture

    it(`${name} [${fixture.kind}, ${fixture.spec}]`, () => {
      const tree = normalizeSchedule(fixture.tree)
      const provider = providerFrom(fixture.currentValues)

      switch (fixture.kind) {
        case "validate": {
          const errors = validate(tree)
          const got = errors.map((e) => ({ code: e.code, nodeIds: [...e.nodeIds].sort() }))
          const want = (fixture.expect.errors as { code: string; nodeIds: string[] }[]).map((e) => ({
            code: e.code,
            nodeIds: [...e.nodeIds].sort(),
          }))
          expect(got).toEqual(expect.arrayContaining(want))
          expect(got.length).toBe(want.length)
          break
        }
        case "resolve": {
          const resolved = resolve(tree, provider)
          checkResolvedNodes(resolved, fixture.expect.nodes as Record<string, Record<string, unknown>>)
          break
        }
        case "compress": {
          const { nodeId, targetSpan } = fixture.op!
          const result = compress(tree, nodeId!, targetSpan!)
          if (fixture.expect.ok === false) {
            expect(result.ok).toBe(false)
            if (!result.ok) {
              expect(result.deficit).toBeCloseTo(fixture.expect.deficit as number, 6)
              expect([...result.blockers].sort()).toEqual([...(fixture.expect.blockers as string[])].sort())
            }
          } else {
            expect(result.ok, "compress should succeed").toBe(true)
            if (result.ok) {
              const byId = indexTree(result.compressed)
              for (const [id, basis] of Object.entries((fixture.expect.durations ?? {}) as Record<string, number>)) {
                const node = byId.get(id)
                expect(node?.kind, `${id} kind`).toBe("vector")
                if (node?.kind === "vector") expect(node.duration.basis, `${id}.duration.basis`).toBeCloseTo(basis, 6)
              }
              for (const [id, basis] of Object.entries((fixture.expect.offsets ?? {}) as Record<string, number>)) {
                const node = byId.get(id)
                if (node?.kind === "vector") expect(node.offset.basis, `${id}.offset.basis`).toBeCloseTo(basis, 6)
              }
            }
          }
          break
        }
        case "trim": {
          const { nodeId, grid, policy } = fixture.op!
          const trimmed = trim(tree, nodeId!, grid!, policy!)
          const resolved = resolve(trimmed, provider)
          checkResolvedNodes(resolved, fixture.expect.nodes as Record<string, Record<string, unknown>>)
          break
        }
        case "feasibility": {
          const { nodeId } = fixture.op!
          if (fixture.expect.minimalWindow !== undefined) {
            expect(minimalWindow(tree, nodeId!)).toBeCloseTo(fixture.expect.minimalWindow as number, 6)
          }
          if (fixture.expect.maximalWindow !== undefined) {
            const got = maximalWindow(tree, nodeId!)
            if (fixture.expect.maximalWindow === null) expect(got).toBeNull()
            else expect(got).toBeCloseTo(fixture.expect.maximalWindow as number, 6)
          }
          break
        }
        case "instances": {
          const { rangeStart, rangeEnd, overrides } = fixture.op!
          const got = instancesOf(tree, provider, rangeStart!, rangeEnd!, overridesFrom(overrides))
          const want = fixture.expect.instances as Record<string, unknown>[]
          expect(got.length, "instance count").toBe(want.length)
          got.forEach((inst, i) => {
            for (const [field, value] of Object.entries(want[i])) {
              expect((inst as unknown as Record<string, unknown>)[field], `instances[${i}].${field}`).toEqual(value)
            }
          })
          break
        }
      }
    })
  }
})
