import { describe, expect, it } from "vitest";

import { createBuiltinReducerRegistry } from "@workspace/graph/builtins";
import type { DataValue } from "@workspace/graph/data-kinds";
import {
  runGraphDocument,
  type GraphValue,
  type ReducerGraphDocument,
} from "@workspace/graph/document";
import type { InputValues } from "@workspace/graph/reducer";

const registry = createBuiltinReducerRegistry();
const executionContext = { timestamp: 0, executionId: "builtins-test" };

async function runBuiltin(
  reducerId: string,
  inputs: InputValues,
): Promise<Record<string, DataValue>> {
  const reducer = registry.get(reducerId);
  if (!reducer) throw new Error(`Reducer "${reducerId}" is not registered.`);
  return reducer.run(inputs, executionContext);
}

function graphDocument(
  reducerId: string,
  inputValues: Record<string, GraphValue>,
): ReducerGraphDocument {
  return {
    schemaVersion: 1,
    id: `${reducerId}-test`,
    title: `${reducerId} test`,
    revision: 0,
    nodes: [
      {
        id: "result",
        reducerId,
        label: reducerId,
        position: { x: 0, y: 0 },
        inputValues,
      },
    ],
    edges: [],
  };
}

describe("builtin reducers", () => {
  it("rejects division by zero and computes a valid quotient", async () => {
    const invalid = await runGraphDocument(
      graphDocument("math.divide", { dividend: 10, divisor: 0 }),
      registry,
    );
    expect(invalid.errors.result).toBe(
      "Validation failed: Divisor must not be zero.",
    );
    expect(invalid.outputs.result).toEqual({ quotient: null });

    await expect(
      runBuiltin("math.divide", { dividend: 12, divisor: 3 }),
    ).resolves.toEqual({ quotient: 4 });
  });

  it("returns a structured error for invalid JSON", async () => {
    const result = await runBuiltin("json.parse", { text: '{"score":' });

    expect(result.value).toBeNull();
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/json|unexpected|end/i);
  });

  it("merges context objects in order", async () => {
    await expect(
      runBuiltin("context.merge", {
        contexts: [
          { name: "Ada", role: "observer" },
          { role: "analyst", active: true },
        ],
      }),
    ).resolves.toEqual({
      context: { name: "Ada", role: "analyst", active: true },
    });
  });

  it("traverses JSON paths through nested objects and array indices", async () => {
    const value = {
      users: [{ name: "Ada" }, { name: "Grace" }],
    };
    await expect(
      runBuiltin("json.get", { value, path: "users[1].name" }),
    ).resolves.toEqual({ value: "Grace", exists: true });
    await expect(
      runBuiltin("json.get", { value, path: "users[2].name" }),
    ).resolves.toEqual({ value: null, exists: false });
  });

  it("coerces a document-supplied string before flow.select runs", async () => {
    const result = await runGraphDocument(
      graphDocument("flow.select", {
        condition: "false",
        whenTrue: "selected",
        whenFalse: "fallback",
      }),
      registry,
    );

    expect(result.errors).toEqual({});
    expect(result.outputs.result).toEqual({ value: "fallback" });
  });

  it("preserves order across multiple collection connections", async () => {
    const collectionDocument: ReducerGraphDocument = {
      schemaVersion: 1,
      id: "ordered-collection-test",
      title: "Ordered collection test",
      revision: 0,
      nodes: [
        {
          id: "first",
          reducerId: "value.number",
          label: "First",
          position: { x: 0, y: 0 },
          inputValues: { value: 2 },
        },
        {
          id: "second",
          reducerId: "value.number",
          label: "Second",
          position: { x: 0, y: 100 },
          inputValues: { value: 4 },
        },
        {
          id: "third",
          reducerId: "value.number",
          label: "Third",
          position: { x: 0, y: 200 },
          inputValues: { value: 8 },
        },
        {
          id: "collect",
          reducerId: "collection.numbers",
          label: "Collect",
          position: { x: 240, y: 100 },
          inputValues: {},
        },
      ],
      edges: [
        {
          id: "third-collect",
          sourceNodeId: "third",
          sourceSocket: "value",
          targetNodeId: "collect",
          targetSocket: "values",
          order: 2,
        },
        {
          id: "first-collect",
          sourceNodeId: "first",
          sourceSocket: "value",
          targetNodeId: "collect",
          targetSocket: "values",
          order: 0,
        },
        {
          id: "second-collect",
          sourceNodeId: "second",
          sourceSocket: "value",
          targetNodeId: "collect",
          targetSocket: "values",
          order: 1,
        },
      ],
    };

    const result = await runGraphDocument(collectionDocument, registry);

    expect(result.errors).toEqual({});
    expect(result.outputs.collect).toEqual({ values: [2, 4, 8] });
  });

  it("computes representative math, logic, and string results", async () => {
    await expect(
      runBuiltin("math.add", { a: 2, b: 3 }),
    ).resolves.toEqual({ sum: 5 });
    await expect(
      runBuiltin("logic.compare", { a: 8, b: 3 }),
    ).resolves.toEqual({ greater: true, equal: false, less: false });
    await expect(
      runBuiltin("text.concat", {
        left: "Ada",
        separator: " ",
        right: "Lovelace",
      }),
    ).resolves.toEqual({ text: "Ada Lovelace" });
  });
});
