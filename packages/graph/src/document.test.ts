import { describe, expect, it } from "vitest";

import { createBuiltinReducerRegistry } from "@workspace/graph/builtins";
import {
  graphComputationKey,
  materializeGraph,
  planGraphCommands,
  reduceGraphDocument,
  runGraphDocument,
  validateGraphDocument,
  type ReducerGraphDocument,
} from "@workspace/graph/document";

const document: ReducerGraphDocument = {
  schemaVersion: 1,
  id: "test",
  title: "Test graph",
  revision: 0,
  nodes: [
    {
      id: "a",
      reducerId: "value.number",
      label: "A",
      position: { x: 0, y: 0 },
      inputValues: { value: 120 },
    },
    {
      id: "b",
      reducerId: "value.number",
      label: "B",
      position: { x: 0, y: 100 },
      inputValues: { value: 28 },
    },
    {
      id: "subtract",
      reducerId: "math.subtract",
      label: "Subtract",
      position: { x: 200, y: 50 },
      inputValues: { a: 0, b: 0 },
    },
  ],
  edges: [
    {
      id: "a-subtract",
      sourceNodeId: "a",
      sourceSocket: "value",
      targetNodeId: "subtract",
      targetSocket: "a",
    },
    {
      id: "b-subtract",
      sourceNodeId: "b",
      sourceSocket: "value",
      targetNodeId: "subtract",
      targetSocket: "b",
    },
  ],
};

describe("reducer graph documents", () => {
  it("executes a typed reducer graph in topological order", async () => {
    const result = await runGraphDocument(
      document,
      createBuiltinReducerRegistry(),
    );

    expect(result.errors).toEqual({});
    expect(result.outputs.subtract?.difference).toBe(92);
  });

  it("collects ordered values from a multi-connection port", async () => {
    const collectionDocument: ReducerGraphDocument = {
      schemaVersion: 1,
      id: "collection-test",
      title: "Collection test",
      revision: 0,
      nodes: [
        {
          id: "one",
          reducerId: "value.number",
          label: "One",
          position: { x: 0, y: 0 },
          inputValues: { value: 1 },
        },
        {
          id: "two",
          reducerId: "value.number",
          label: "Two",
          position: { x: 0, y: 100 },
          inputValues: { value: 2 },
        },
        {
          id: "three",
          reducerId: "value.number",
          label: "Three",
          position: { x: 0, y: 200 },
          inputValues: { value: 3 },
        },
        {
          id: "collect",
          reducerId: "collection.numbers",
          label: "Collect",
          position: { x: 200, y: 100 },
          inputValues: {},
        },
        {
          id: "stats",
          reducerId: "aggregate.numbers",
          label: "Stats",
          position: { x: 400, y: 100 },
          inputValues: { values: [] },
        },
      ],
      edges: [
        {
          id: "three-collect",
          sourceNodeId: "three",
          sourceSocket: "value",
          targetNodeId: "collect",
          targetSocket: "values",
          order: 2,
        },
        {
          id: "one-collect",
          sourceNodeId: "one",
          sourceSocket: "value",
          targetNodeId: "collect",
          targetSocket: "values",
          order: 0,
        },
        {
          id: "two-collect",
          sourceNodeId: "two",
          sourceSocket: "value",
          targetNodeId: "collect",
          targetSocket: "values",
          order: 1,
        },
        {
          id: "collect-stats",
          sourceNodeId: "collect",
          sourceSocket: "values",
          targetNodeId: "stats",
          targetSocket: "values",
        },
      ],
    };

    const result = await runGraphDocument(
      collectionDocument,
      createBuiltinReducerRegistry(),
    );

    expect(result.errors).toEqual({});
    expect(result.outputs.collect?.values).toEqual([1, 2, 3]);
    expect(result.outputs.stats).toMatchObject({
      sum: 6,
      average: 2,
      minimum: 1,
      maximum: 3,
      count: 3,
    });
  });

  it("composes prompt and JSON reducers through typed ports", async () => {
    const promptDocument: ReducerGraphDocument = {
      schemaVersion: 1,
      id: "prompt-test",
      title: "Prompt test",
      revision: 0,
      nodes: [
        {
          id: "context",
          reducerId: "json.value",
          label: "Context",
          position: { x: 0, y: 0 },
          inputValues: { value: { character: { name: "Ada" } } },
        },
        {
          id: "prompt",
          reducerId: "prompt.template",
          label: "Prompt",
          position: { x: 200, y: 0 },
          inputValues: {
            template: "Describe {{character.name}} in one sentence.",
            context: {},
          },
        },
        {
          id: "serialized",
          reducerId: "json.stringify",
          label: "Serialized",
          position: { x: 200, y: 120 },
          inputValues: { value: null, spaces: 0 },
        },
      ],
      edges: [
        {
          id: "context-prompt",
          sourceNodeId: "context",
          sourceSocket: "value",
          targetNodeId: "prompt",
          targetSocket: "context",
        },
        {
          id: "context-stringify",
          sourceNodeId: "context",
          sourceSocket: "value",
          targetNodeId: "serialized",
          targetSocket: "value",
        },
      ],
    };

    const result = await runGraphDocument(
      promptDocument,
      createBuiltinReducerRegistry(),
    );

    expect(result.errors).toEqual({});
    expect(result.outputs.prompt).toEqual({
      prompt: "Describe Ada in one sentence.",
      missing: [],
    });
    expect(result.outputs.serialized?.text).toBe(
      '{"character":{"name":"Ada"}}',
    );
  });

  it("updates nodes immutably and increments the revision", () => {
    const next = reduceGraphDocument(document, {
      type: "node.update",
      id: "a",
      patch: { label: "Budget", inputValues: { value: 150 } },
    });

    expect(next.revision).toBe(1);
    expect(next.nodes[0]).toMatchObject({
      label: "Budget",
      inputValues: { value: 150 },
    });
    expect(document.nodes[0]).toMatchObject({
      label: "A",
      inputValues: { value: 120 },
    });
  });

  it("keeps layout-only revisions out of the computation key", () => {
    const moved = reduceGraphDocument(document, {
      type: "node.move",
      id: "a",
      position: { x: 400, y: 300 },
    });
    const relabeled = reduceGraphDocument(document, {
      type: "node.update",
      id: "a",
      patch: { label: "Renamed" },
    });
    const viewportChanged = reduceGraphDocument(document, {
      type: "viewport.update",
      viewport: { x: 50, y: 75, zoom: 1.2 },
    });
    const valueChanged = reduceGraphDocument(document, {
      type: "node.update",
      id: "a",
      patch: { inputValues: { value: 150 } },
    });

    expect(graphComputationKey(moved)).toBe(graphComputationKey(document));
    expect(graphComputationKey(relabeled)).toBe(graphComputationKey(document));
    expect(graphComputationKey(viewportChanged)).toBe(
      graphComputationKey(document),
    );
    expect(graphComputationKey(valueChanged)).not.toBe(
      graphComputationKey(document),
    );
  });

  it("validates layout-only plans without executing reducers", async () => {
    const plan = await planGraphCommands(
      document,
      [
        {
          type: "node.move",
          id: "a",
          position: { x: 400, y: 300 },
        },
        {
          type: "viewport.update",
          viewport: { x: 50, y: 75, zoom: 1.2 },
        },
      ],
      createBuiltinReducerRegistry(),
    );

    expect(plan.valid).toBe(true);
    expect(plan.run).toBeUndefined();
  });

  it("rejects connections between incompatible typed sockets", () => {
    const invalid = reduceGraphDocument(document, {
      type: "edge.add",
      edge: {
        id: "invalid",
        sourceNodeId: "subtract",
        sourceSocket: "difference",
        targetNodeId: "subtract",
        targetSocket: "a",
      },
    });

    expect(() =>
      materializeGraph(invalid, createBuiltinReducerRegistry()),
    ).toThrow("Invalid connection");
  });

  it("plans multiple edits as one validated revision with a diff", async () => {
    const plan = await planGraphCommands(
      document,
      [
        {
          type: "node.update",
          id: "a",
          patch: { inputValues: { value: 150 } },
        },
        { type: "node.update", id: "b", patch: { label: "Allocation" } },
      ],
      createBuiltinReducerRegistry(),
    );

    expect(plan).toMatchObject({
      valid: true,
      expectedRevision: 0,
      proposedRevision: 1,
      diff: { nodes: { added: [], updated: ["a", "b"], removed: [] } },
      run: { outputs: { subtract: { difference: 122 } } },
    });
    expect(plan.document?.revision).toBe(1);
  });

  it("reports invalid dry-run connections without mutating the source", async () => {
    const plan = await planGraphCommands(
      document,
      [
        {
          type: "edge.add",
          edge: {
            id: "cycle",
            sourceNodeId: "subtract",
            sourceSocket: "difference",
            targetNodeId: "subtract",
            targetSocket: "a",
          },
        },
      ],
      createBuiltinReducerRegistry(),
    );

    expect(plan.valid).toBe(false);
    expect(plan.issues.some(({ code }) => code === "invalid-connection")).toBe(
      true,
    );
    expect(document.revision).toBe(0);
  });

  it("rejects unknown batch commands instead of accepting a no-op revision", async () => {
    const plan = await planGraphCommands(
      document,
      [
        { type: "unknown.command" } as unknown as Parameters<
          typeof reduceGraphDocument
        >[1],
      ],
      createBuiltinReducerRegistry(),
    );

    expect(plan).toMatchObject({
      valid: false,
      issues: [
        {
          code: "command",
          message: 'Unknown graph command "unknown.command".',
        },
      ],
    });
    expect(document.revision).toBe(0);
  });

  it("reports the node and socket when default coercion fails", () => {
    const invalid = {
      ...document,
      nodes: document.nodes.map((node, index) =>
        index === 0 ? { ...node, inputValues: { value: { bad: true } } } : node,
      ),
    };

    expect(() =>
      materializeGraph(invalid, createBuiltinReducerRegistry()),
    ).toThrow('Input "a.value" cannot be coerced');
  });

  it("rejects edge socket names containing colons", () => {
    const invalid = {
      ...document,
      edges: document.edges.map((edge, index) =>
        index === 0 ? { ...edge, sourceSocket: "value:invalid" } : edge,
      ),
    };
    const issues = validateGraphDocument(
      invalid,
      createBuiltinReducerRegistry(),
    );

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "invalid-id",
          message: 'Invalid edge "a-subtract": socket names cannot contain ":".',
          resourceId: "a-subtract",
        }),
      ]),
    );
    expect(() =>
      materializeGraph(invalid, createBuiltinReducerRegistry()),
    ).toThrow(
      'Invalid edge "a-subtract": socket names cannot contain ":".',
    );
  });

  it("rejects node ids containing colons", () => {
    const invalid = {
      ...document,
      nodes: document.nodes.map((node, index) =>
        index === 0 ? { ...node, id: "bad:node" } : node,
      ),
    };
    const issues = validateGraphDocument(
      invalid,
      createBuiltinReducerRegistry(),
    );

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "invalid-id",
          message: 'Node id "bad:node" cannot contain ":".',
          resourceId: "bad:node",
        }),
      ]),
    );
    expect(() =>
      reduceGraphDocument(document, {
        type: "node.add",
        node: {
          id: "bad:node",
          reducerId: "value.number",
          label: "Invalid",
          position: { x: 0, y: 0 },
          inputValues: { value: 1 },
        },
      }),
    ).toThrow('Invalid node id "bad:node"');
  });
});
