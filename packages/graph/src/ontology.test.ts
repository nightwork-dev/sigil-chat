import { describe, expect, it, vi } from "vitest"

import { validateGraphDocument } from "@workspace/graph/document"
import {
  ontologyFixtureDelta,
  ontologyFixtureGraph,
  ontologyFixtureTurn,
} from "@workspace/graph/ontology.fixture"
import {
  applyGraphDelta,
  createOntologyReducerRegistry,
  extractGraphDelta,
  projectOntologyWorkingState,
  reconcileUserEdit,
  stableOntologyId,
  type GraphDeltaExtractor,
} from "@workspace/graph/ontology"

describe("realtime ontology graph engine", () => {
  it("delegates extraction through the injectable seam without doing I/O", async () => {
    const extractor = vi.fn<GraphDeltaExtractor>(() => ontologyFixtureDelta)

    const delta = await extractGraphDelta(
      ontologyFixtureGraph,
      ontologyFixtureTurn,
      extractor,
    )

    expect(delta).toEqual(ontologyFixtureDelta)
    expect(extractor).toHaveBeenCalledWith({
      priorGraph: ontologyFixtureGraph,
      workingState: { entities: [], relations: [], claims: [] },
      turn: ontologyFixtureTurn,
    })
  })

  it("applies fixture resources as a valid reducer graph document", () => {
    const graph = applyGraphDelta(ontologyFixtureGraph, ontologyFixtureDelta)
    const fixtureResourceCount =
      (ontologyFixtureDelta.entities?.length ?? 0) +
      (ontologyFixtureDelta.relations?.length ?? 0) +
      (ontologyFixtureDelta.claims?.length ?? 0)
    const fixtureReferenceCount =
      (ontologyFixtureDelta.relations?.length ?? 0) * 2 +
      (ontologyFixtureDelta.claims ?? []).filter(
        ({ subjectEntityKey }) => subjectEntityKey,
      ).length

    expect(graph.nodes).toHaveLength(fixtureResourceCount)
    expect(graph.edges).toHaveLength(fixtureReferenceCount)
    expect(graph.revision).toBe(ontologyFixtureGraph.revision + 1)
    expect(
      validateGraphDocument(graph, createOntologyReducerRegistry()),
    ).toEqual([])
    expect(ontologyFixtureGraph.nodes).toEqual([])
  })

  it("updates a stable entity instead of duplicating it", () => {
    const initial = applyGraphDelta(ontologyFixtureGraph, ontologyFixtureDelta)
    const entity = ontologyFixtureDelta.entities?.[0]
    if (!entity) throw new Error("Fixture must contain an entity.")

    const updated = applyGraphDelta(initial, {
      entities: [
        {
          ...entity,
          key: entity.key.toLocaleUpperCase("en-US"),
          label: `${entity.label} Updated`,
        },
      ],
    })
    const entityId = stableOntologyId("entity", entity.key)
    const matching = updated.nodes.filter(({ id }) => id === entityId)

    expect(matching).toHaveLength(
      initial.nodes.filter(({ id }) => id === entityId).length,
    )
    expect(matching[0]?.label).toBe(`${entity.label} Updated`)
    expect(matching[0]?.position).toEqual(
      initial.nodes.find(({ id }) => id === entityId)?.position,
    )
  })

  it("makes a user correction change the agent's next act", async () => {
    const initial = applyGraphDelta(ontologyFixtureGraph, ontologyFixtureDelta)
    const fixtureClaim = ontologyFixtureDelta.claims?.[0]
    if (!fixtureClaim) throw new Error("Fixture must contain a claim.")
    const claimId = stableOntologyId("claim", fixtureClaim.key)
    const correctedText = fixtureClaim.text.replace("Friday", "Monday")
    const corrected = reconcileUserEdit(initial, {
      type: "claim.update",
      id: claimId,
      patch: { text: correctedText, status: "corrected" },
    })
    const nextTurn = {
      ...ontologyFixtureTurn,
      id: `${ontologyFixtureTurn.id}-next`,
      content: "When does Atlas launch?",
    }
    const nextActExtractor: GraphDeltaExtractor = ({ workingState }) => {
      const launch = workingState.claims.find(
        ({ key }) => key === fixtureClaim.key,
      )
      return {
        claims: [
          {
            key: `${fixtureClaim.key}-answer`,
            text: `Answer: ${launch?.text ?? "unknown"}`,
          },
        ],
      }
    }

    const uncorrectedAct = await extractGraphDelta(
      initial,
      nextTurn,
      nextActExtractor,
    )
    const correctedAct = await extractGraphDelta(
      corrected,
      nextTurn,
      nextActExtractor,
    )

    expect(uncorrectedAct.claims?.[0]?.text).toContain(fixtureClaim.text)
    expect(correctedAct.claims?.[0]?.text).toContain(correctedText)
    expect(correctedAct).not.toEqual(uncorrectedAct)
    expect(
      projectOntologyWorkingState(corrected).claims.find(
        ({ id }) => id === claimId,
      ),
    ).toMatchObject({
      text: correctedText,
      status: "corrected",
      authority: "user",
    })
  })

  it("does not let later extraction overwrite an authoritative user edit", () => {
    const initial = applyGraphDelta(ontologyFixtureGraph, ontologyFixtureDelta)
    const fixtureClaim = ontologyFixtureDelta.claims?.[0]
    if (!fixtureClaim) throw new Error("Fixture must contain a claim.")
    const claimId = stableOntologyId("claim", fixtureClaim.key)
    const correctedText = fixtureClaim.text.replace("Friday", "Monday")
    const corrected = reconcileUserEdit(initial, {
      type: "claim.update",
      id: claimId,
      patch: { text: correctedText, status: "corrected" },
    })

    const reextracted = applyGraphDelta(corrected, {
      claims: [{ ...fixtureClaim, text: fixtureClaim.text }],
    })

    expect(
      projectOntologyWorkingState(reextracted).claims.find(
        ({ id }) => id === claimId,
      ),
    ).toMatchObject({
      text: correctedText,
      authority: "user",
    })
  })

  it("keeps structural relation edges aligned with an authoritative edit", () => {
    const initial = applyGraphDelta(ontologyFixtureGraph, ontologyFixtureDelta)
    const fixtureRelation = ontologyFixtureDelta.relations?.[0]
    const entities = ontologyFixtureDelta.entities ?? []
    if (!fixtureRelation || entities.length < 2) {
      throw new Error("Fixture must contain a relation and two entities.")
    }
    const relationId = stableOntologyId("relation", fixtureRelation.key)
    const replacementSubject = entities.find(
      ({ key }) => key !== fixtureRelation.subjectEntityKey,
    )
    if (!replacementSubject) {
      throw new Error("Fixture must contain a replacement subject entity.")
    }

    const corrected = reconcileUserEdit(initial, {
      type: "relation.update",
      id: relationId,
      patch: { subjectEntityKey: replacementSubject.key },
    })
    const subjectEdge = corrected.edges.find(
      ({ targetNodeId, targetSocket }) =>
        targetNodeId === relationId && targetSocket === "subject",
    )

    expect(subjectEdge?.sourceNodeId).toBe(
      stableOntologyId("entity", replacementSubject.key),
    )
    expect(
      projectOntologyWorkingState(corrected).relations.find(
        ({ id }) => id === relationId,
      ),
    ).toMatchObject({
      subjectEntityKey: replacementSubject.key,
      authority: "user",
    })

    const reextracted = applyGraphDelta(corrected, {
      relations: [fixtureRelation],
    })
    expect(
      reextracted.edges.find(
        ({ targetNodeId, targetSocket }) =>
          targetNodeId === relationId && targetSocket === "subject",
      )?.sourceNodeId,
    ).toBe(stableOntologyId("entity", replacementSubject.key))
  })
})
