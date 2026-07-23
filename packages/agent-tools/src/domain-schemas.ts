export const readHints = {
  mcp: {
    annotations: {
      readOnly: true,
      destructive: false,
      idempotent: true,
      openWorld: false,
    },
  },
} as const;

export const writeHints = {
  mcp: {
    annotations: {
      readOnly: false,
      destructive: false,
      idempotent: false,
      openWorld: false,
    },
  },
} as const;

export function emptyObjectSchema(): Record<string, unknown> {
  return { type: "object", properties: {}, additionalProperties: false };
}

export function reviewItemsSchema(statuses: string[]): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      ids: {
        type: "array",
        minItems: 1,
        uniqueItems: true,
        items: { type: "string", minLength: 1 },
      },
      passageIds: {
        type: "array",
        minItems: 1,
        uniqueItems: true,
        items: { type: "string", minLength: 1 },
      },
      status: { type: "string", enum: statuses },
    },
    additionalProperties: false,
  };
}

export function batchInputSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      commands: {
        type: "array",
        minItems: 1,
        items: graphCommandSchema(),
      },
      expectedRevision: { type: "integer" },
    },
    required: ["commands"],
    additionalProperties: false,
  };
}

export function graphEditInputSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      actions: {
        type: "array",
        minItems: 1,
        description:
          "Ordered actions committed together. Later actions may reference explicit ids created earlier in this array.",
        items: {
          oneOf: [
            objectSchema(
              {
                type: { const: "add-node" },
                reducerId: { type: "string" },
                id: { type: "string" },
                label: { type: "string" },
                position: positionSchema(),
                inputValues: graphValuesSchema(),
              },
              ["type", "reducerId"],
            ),
            objectSchema(
              {
                type: { const: "update-node" },
                id: { type: "string" },
                label: { type: "string" },
                inputValues: graphValuesSchema(),
              },
              ["type", "id"],
            ),
            objectSchema(
              {
                type: { const: "move-node" },
                id: { type: "string" },
                position: positionSchema(),
              },
              ["type", "id", "position"],
            ),
            objectSchema(
              { type: { const: "remove-node" }, id: { type: "string" } },
              ["type", "id"],
            ),
            objectSchema(
              {
                type: { const: "connect" },
                id: { type: "string" },
                sourceNodeId: { type: "string" },
                sourceSocket: { type: "string" },
                targetNodeId: { type: "string" },
                targetSocket: { type: "string" },
                order: { type: "integer" },
              },
              [
                "type",
                "sourceNodeId",
                "sourceSocket",
                "targetNodeId",
                "targetSocket",
              ],
            ),
            objectSchema(
              { type: { const: "remove-edge" }, id: { type: "string" } },
              ["type", "id"],
            ),
          ],
        },
      },
      expectedRevision: { type: "integer" },
    },
    required: ["actions"],
    additionalProperties: false,
  };
}

export function graphCommandSchema(): Record<string, unknown> {
  return {
    oneOf: [
      objectSchema(
        {
          type: { const: "node.add" },
          node: objectSchema(
            {
              id: { type: "string" },
              reducerId: { type: "string" },
              label: { type: "string" },
              position: positionSchema(),
              inputValues: graphValuesSchema(),
            },
            ["id", "reducerId", "label", "position", "inputValues"],
          ),
        },
        ["type", "node"],
      ),
      objectSchema(
        {
          type: { const: "node.update" },
          id: { type: "string" },
          patch: objectSchema({
            label: { type: "string" },
            inputValues: graphValuesSchema(),
          }),
        },
        ["type", "id", "patch"],
      ),
      objectSchema(
        {
          type: { const: "node.move" },
          id: { type: "string" },
          position: positionSchema(),
        },
        ["type", "id", "position"],
      ),
      objectSchema({ type: { const: "node.remove" }, id: { type: "string" } }, [
        "type",
        "id",
      ]),
      objectSchema(
        {
          type: { const: "edge.add" },
          edge: objectSchema(
            {
              id: { type: "string" },
              sourceNodeId: { type: "string" },
              sourceSocket: { type: "string" },
              targetNodeId: { type: "string" },
              targetSocket: { type: "string" },
              order: { type: "integer" },
            },
            [
              "id",
              "sourceNodeId",
              "sourceSocket",
              "targetNodeId",
              "targetSocket",
            ],
          ),
        },
        ["type", "edge"],
      ),
      objectSchema({ type: { const: "edge.remove" }, id: { type: "string" } }, [
        "type",
        "id",
      ]),
      objectSchema(
        {
          type: { const: "viewport.update" },
          viewport: objectSchema(
            {
              x: { type: "number" },
              y: { type: "number" },
              zoom: { type: "number" },
            },
            ["x", "y", "zoom"],
          ),
        },
        ["type", "viewport"],
      ),
    ],
  };
}

export function objectSchema(
  properties: Record<string, unknown>,
  required: string[] = [],
): Record<string, unknown> {
  return {
    type: "object",
    properties,
    ...(required.length > 0 ? { required } : {}),
    additionalProperties: false,
  };
}

export function positionSchema(): Record<string, unknown> {
  return objectSchema({ x: { type: "number" }, y: { type: "number" } }, [
    "x",
    "y",
  ]);
}

export function graphValuesSchema(): Record<string, unknown> {
  return { type: "object", additionalProperties: true };
}
