import { DataKind, type DataValue } from "@workspace/graph/data-kinds";
import { ReducerRegistry, type Reducer } from "@workspace/graph/reducer";
import type { SocketDefinition, SocketRole } from "@workspace/graph/socket";

interface InputOptions {
  defaultValue?: DataValue;
  description?: string;
  label?: string;
  multiple?: boolean;
  required?: boolean;
  role?: SocketRole;
  accepts?: DataKind[];
}

const input = (
  name: string,
  kind: DataKind,
  options: InputOptions = {},
): SocketDefinition => ({ name, kind, role: "value", ...options });

const output = (
  name: string,
  kind: DataKind,
  options: Omit<InputOptions, "defaultValue" | "required"> = {},
): SocketDefinition => ({ name, kind, role: "value", ...options });

const numberInput = (name: string, defaultValue = 0, label?: string) =>
  input(name, DataKind.Number, { defaultValue, label });

const stringInput = (name: string, defaultValue = "", label?: string) =>
  input(name, DataKind.String, { defaultValue, label });

const booleanInput = (name: string, defaultValue = false, label?: string) =>
  input(name, DataKind.Boolean, {
    defaultValue,
    label,
    role: "condition",
  });

const numericValues = (value: DataValue | undefined): number[] =>
  Array.isArray(value) ? value.map(Number).filter(Number.isFinite) : [];

const stringValues = (value: DataValue | undefined): string[] =>
  Array.isArray(value) ? value.map(String) : [];

const contextValues = (
  value: DataValue | undefined,
): Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.filter(
        (candidate): candidate is Record<string, unknown> =>
          typeof candidate === "object" &&
          candidate !== null &&
          !Array.isArray(candidate),
      )
    : [];

function readPath(
  source: DataValue | undefined,
  path: string,
): { exists: boolean; value: DataValue } {
  const parts = path
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);
  let current: unknown = source;
  for (const part of parts) {
    if (typeof current !== "object" || current === null || !(part in current)) {
      return { exists: false, value: null };
    }
    current = (current as Record<string, unknown>)[part];
  }
  return { exists: true, value: current as DataValue };
}

function formatPromptValue(value: DataValue): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

export const builtinReducers: Reducer[] = [
  {
    id: "value.number",
    name: "Number",
    description: "A directly editable numeric value.",
    inputs: [numberInput("value")],
    outputs: [output("value", DataKind.Number)],
    run: ({ value }) => ({ value }),
    examples: [
      {
        name: "Editable scalar",
        inputs: { value: 12 },
        outputs: { value: 12 },
      },
    ],
    pure: true,
  },
  {
    id: "value.string",
    name: "Text value",
    description: "A directly editable text value.",
    inputs: [stringInput("value")],
    outputs: [output("value", DataKind.String)],
    run: ({ value }) => ({ value: String(value ?? "") }),
    examples: [
      {
        name: "Editable text",
        inputs: { value: "hello" },
        outputs: { value: "hello" },
      },
    ],
    pure: true,
  },
  {
    id: "value.boolean",
    name: "Boolean",
    description: "A directly editable true or false value.",
    inputs: [booleanInput("value")],
    outputs: [output("value", DataKind.Boolean, { role: "condition" })],
    run: ({ value }) => ({ value: Boolean(value) }),
    examples: [
      {
        name: "Feature flag",
        inputs: { value: true },
        outputs: { value: true },
      },
    ],
    pure: true,
  },
  {
    id: "math.add",
    name: "Add",
    description: "Adds two numbers.",
    inputs: [numberInput("a"), numberInput("b")],
    outputs: [output("sum", DataKind.Number)],
    run: ({ a, b }) => ({ sum: Number(a) + Number(b) }),
    examples: [
      { name: "Add two values", inputs: { a: 8, b: 5 }, outputs: { sum: 13 } },
    ],
    pure: true,
  },
  {
    id: "math.subtract",
    name: "Subtract",
    description: "Subtracts b from a.",
    inputs: [numberInput("a"), numberInput("b")],
    outputs: [output("difference", DataKind.Number)],
    run: ({ a, b }) => ({ difference: Number(a) - Number(b) }),
    examples: [
      {
        name: "Remaining amount",
        inputs: { a: 20, b: 7 },
        outputs: { difference: 13 },
      },
    ],
    pure: true,
  },
  {
    id: "math.multiply",
    name: "Multiply",
    description: "Multiplies two numbers.",
    inputs: [numberInput("a", 1), numberInput("b", 1)],
    outputs: [output("product", DataKind.Number)],
    run: ({ a, b }) => ({ product: Number(a) * Number(b) }),
    examples: [
      {
        name: "Scale a value",
        inputs: { a: 6, b: 4 },
        outputs: { product: 24 },
      },
    ],
    pure: true,
  },
  {
    id: "math.divide",
    name: "Divide",
    description: "Divides the dividend by a non-zero divisor.",
    inputs: [numberInput("dividend"), numberInput("divisor", 1)],
    outputs: [output("quotient", DataKind.Number)],
    run: ({ dividend, divisor }) => ({
      quotient: Number(dividend) / Number(divisor),
    }),
    validate: ({ divisor }) => ({
      valid: Number(divisor) !== 0,
      errors: Number(divisor) === 0 ? ["Divisor must not be zero."] : undefined,
    }),
    constraints: ["divisor must not be zero"],
    examples: [
      {
        name: "Split a total",
        inputs: { dividend: 20, divisor: 4 },
        outputs: { quotient: 5 },
      },
    ],
    pure: true,
  },
  {
    id: "math.modulo",
    name: "Modulo",
    description: "Returns the remainder after division.",
    inputs: [numberInput("dividend"), numberInput("divisor", 1)],
    outputs: [output("remainder", DataKind.Number)],
    run: ({ dividend, divisor }) => ({
      remainder: Number(dividend) % Number(divisor),
    }),
    validate: ({ divisor }) => ({
      valid: Number(divisor) !== 0,
      errors: Number(divisor) === 0 ? ["Divisor must not be zero."] : undefined,
    }),
    constraints: ["divisor must not be zero"],
    examples: [
      {
        name: "Wrap an index",
        inputs: { dividend: 8, divisor: 3 },
        outputs: { remainder: 2 },
      },
    ],
    pure: true,
  },
  {
    id: "math.minimum",
    name: "Minimum",
    description: "Returns the smaller of two numbers.",
    inputs: [numberInput("a"), numberInput("b")],
    outputs: [output("minimum", DataKind.Number)],
    run: ({ a, b }) => ({ minimum: Math.min(Number(a), Number(b)) }),
    examples: [
      {
        name: "Pick the lower limit",
        inputs: { a: 8, b: 5 },
        outputs: { minimum: 5 },
      },
    ],
    pure: true,
  },
  {
    id: "math.maximum",
    name: "Maximum",
    description: "Returns the larger of two numbers.",
    inputs: [numberInput("a"), numberInput("b")],
    outputs: [output("maximum", DataKind.Number)],
    run: ({ a, b }) => ({ maximum: Math.max(Number(a), Number(b)) }),
    examples: [
      {
        name: "Pick the higher limit",
        inputs: { a: 8, b: 5 },
        outputs: { maximum: 8 },
      },
    ],
    pure: true,
  },
  {
    id: "math.round",
    name: "Round",
    description: "Rounds a number to an editable number of decimal places.",
    inputs: [numberInput("value"), numberInput("places")],
    outputs: [output("rounded", DataKind.Number)],
    run: ({ value, places }) => {
      const factor = 10 ** Math.trunc(Number(places));
      return { rounded: Math.round(Number(value) * factor) / factor };
    },
    constraints: ["places is interpreted as an integer"],
    examples: [
      {
        name: "Round currency",
        inputs: { value: 12.345, places: 2 },
        outputs: { rounded: 12.35 },
      },
    ],
    pure: true,
  },
  {
    id: "constraint.clamp",
    name: "Clamp",
    description: "Constrains a number to an editable lower and upper bound.",
    inputs: [
      numberInput("value"),
      numberInput("minimum"),
      numberInput("maximum", 100),
    ],
    outputs: [
      output("value", DataKind.Number),
      output("constrained", DataKind.Boolean, { role: "condition" }),
    ],
    run: ({ value, minimum, maximum }) => {
      const numericValue = Number(value);
      const lo = Number(minimum);
      const hi = Number(maximum);
      const clamped = Math.min(Math.max(numericValue, lo), hi);
      return { value: clamped, constrained: clamped !== numericValue };
    },
    validate: ({ minimum, maximum }) => ({
      valid: Number(minimum) <= Number(maximum),
      errors:
        Number(minimum) <= Number(maximum)
          ? undefined
          : ["Minimum must not exceed maximum."],
    }),
    constraints: ["minimum must be less than or equal to maximum"],
    examples: [
      {
        name: "Constrain a value to an envelope",
        inputs: { value: 140, minimum: 10, maximum: 100 },
        outputs: { value: 100, constrained: true },
      },
    ],
    pure: true,
  },
  {
    id: "logic.compare",
    name: "Compare numbers",
    description:
      "Compares two numbers and exposes all three outcomes as ports.",
    inputs: [numberInput("a"), numberInput("b")],
    outputs: [
      output("greater", DataKind.Boolean, { role: "condition" }),
      output("equal", DataKind.Boolean, { role: "condition" }),
      output("less", DataKind.Boolean, { role: "condition" }),
    ],
    run: ({ a, b }) => ({
      greater: Number(a) > Number(b),
      equal: Number(a) === Number(b),
      less: Number(a) < Number(b),
    }),
    examples: [
      {
        name: "Three-way comparison",
        inputs: { a: 3, b: 5 },
        outputs: { greater: false, equal: false, less: true },
      },
    ],
    pure: true,
  },
  {
    id: "logic.greater-than",
    name: "Greater than",
    description: "Tests whether a is greater than b.",
    inputs: [numberInput("a"), numberInput("b")],
    outputs: [output("result", DataKind.Boolean, { role: "condition" })],
    run: ({ a, b }) => ({ result: Number(a) > Number(b) }),
    examples: [
      {
        name: "Threshold test",
        inputs: { a: 11, b: 10 },
        outputs: { result: true },
      },
    ],
    pure: true,
  },
  {
    id: "logic.less-than",
    name: "Less than",
    description: "Tests whether a is less than b.",
    inputs: [numberInput("a"), numberInput("b")],
    outputs: [output("result", DataKind.Boolean, { role: "condition" })],
    run: ({ a, b }) => ({ result: Number(a) < Number(b) }),
    examples: [
      {
        name: "Lower-bound test",
        inputs: { a: 4, b: 10 },
        outputs: { result: true },
      },
    ],
    pure: true,
  },
  {
    id: "logic.equal",
    name: "Equal",
    description: "Tests two scalar or structured values for equality.",
    inputs: [
      input("a", DataKind.Any, { defaultValue: null }),
      input("b", DataKind.Any, { defaultValue: null }),
    ],
    outputs: [output("result", DataKind.Boolean, { role: "condition" })],
    run: ({ a, b }) => ({
      result: Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b),
    }),
    examples: [
      {
        name: "Compare labels",
        inputs: { a: "ready", b: "ready" },
        outputs: { result: true },
      },
    ],
    pure: true,
  },
  {
    id: "logic.and",
    name: "And",
    description: "True only when both conditions are true.",
    inputs: [booleanInput("a"), booleanInput("b")],
    outputs: [output("result", DataKind.Boolean, { role: "condition" })],
    run: ({ a, b }) => ({ result: Boolean(a) && Boolean(b) }),
    examples: [
      {
        name: "Require both gates",
        inputs: { a: true, b: false },
        outputs: { result: false },
      },
    ],
    pure: true,
  },
  {
    id: "logic.or",
    name: "Or",
    description: "True when either condition is true.",
    inputs: [booleanInput("a"), booleanInput("b")],
    outputs: [output("result", DataKind.Boolean, { role: "condition" })],
    run: ({ a, b }) => ({ result: Boolean(a) || Boolean(b) }),
    examples: [
      {
        name: "Accept either gate",
        inputs: { a: true, b: false },
        outputs: { result: true },
      },
    ],
    pure: true,
  },
  {
    id: "logic.not",
    name: "Not",
    description: "Inverts a condition.",
    inputs: [booleanInput("value")],
    outputs: [output("result", DataKind.Boolean, { role: "condition" })],
    run: ({ value }) => ({ result: !Boolean(value) }),
    examples: [
      {
        name: "Invert a flag",
        inputs: { value: true },
        outputs: { result: false },
      },
    ],
    pure: true,
  },
  {
    id: "flow.select",
    name: "Select",
    description: "Chooses one of two values using a boolean condition.",
    inputs: [
      booleanInput("condition", false, "Condition"),
      input("whenTrue", DataKind.Any, {
        defaultValue: null,
        label: "When true",
      }),
      input("whenFalse", DataKind.Any, {
        defaultValue: null,
        label: "When false",
      }),
    ],
    outputs: [output("value", DataKind.Any)],
    run: ({ condition, whenTrue, whenFalse }) => ({
      value: condition ? whenTrue : whenFalse,
    }),
    examples: [
      {
        name: "Choose a label",
        inputs: { condition: true, whenTrue: "open", whenFalse: "closed" },
        outputs: { value: "open" },
      },
    ],
    pure: true,
  },
  {
    id: "collection.numbers",
    name: "Collect numbers",
    description:
      "Collects one or more number or number-array connections in port order.",
    inputs: [
      input("values", DataKind.NumberArray, {
        accepts: [DataKind.Number, DataKind.NumberArray],
        label: "Numbers",
        multiple: true,
        role: "collection",
      }),
    ],
    outputs: [output("values", DataKind.NumberArray, { role: "collection" })],
    run: ({ values }) => ({ values: numericValues(values) }),
    examples: [
      {
        name: "Collect a series",
        inputs: { values: [2, 4, 8] },
        outputs: { values: [2, 4, 8] },
      },
    ],
    pure: true,
  },
  {
    id: "aggregate.numbers",
    name: "Number statistics",
    description: "Computes summary statistics for a number collection.",
    inputs: [
      input("values", DataKind.NumberArray, {
        defaultValue: [],
        label: "Numbers",
        role: "collection",
      }),
    ],
    outputs: [
      output("sum", DataKind.Number),
      output("average", DataKind.Number),
      output("minimum", DataKind.Number),
      output("maximum", DataKind.Number),
      output("count", DataKind.Number),
    ],
    run: ({ values }) => {
      const numbers = numericValues(values);
      const sum = numbers.reduce((total, value) => total + value, 0);
      return {
        sum,
        average: numbers.length > 0 ? sum / numbers.length : 0,
        minimum: numbers.length > 0 ? Math.min(...numbers) : 0,
        maximum: numbers.length > 0 ? Math.max(...numbers) : 0,
        count: numbers.length,
      };
    },
    examples: [
      {
        name: "Summarize a series",
        inputs: { values: [2, 4, 6] },
        outputs: { sum: 12, average: 4, minimum: 2, maximum: 6, count: 3 },
      },
    ],
    pure: true,
  },
  {
    id: "collection.strings",
    name: "Collect text",
    description:
      "Collects one or more string or string-array connections in port order.",
    inputs: [
      input("values", DataKind.StringArray, {
        accepts: [DataKind.String, DataKind.StringArray],
        label: "Text values",
        multiple: true,
        role: "collection",
      }),
    ],
    outputs: [output("values", DataKind.StringArray, { role: "collection" })],
    run: ({ values }) => ({ values: stringValues(values) }),
    examples: [
      {
        name: "Collect labels",
        inputs: { values: ["north", "south"] },
        outputs: { values: ["north", "south"] },
      },
    ],
    pure: true,
  },
  {
    id: "text.concat",
    name: "Concatenate text",
    description: "Combines two text values with an optional separator.",
    inputs: [
      stringInput("left"),
      stringInput("separator", " "),
      stringInput("right"),
    ],
    outputs: [output("text", DataKind.String)],
    run: ({ left, separator, right }) => ({
      text: `${String(left)}${String(separator)}${String(right)}`,
    }),
    examples: [
      {
        name: "Join a name",
        inputs: { left: "Ada", separator: " ", right: "Lovelace" },
        outputs: { text: "Ada Lovelace" },
      },
    ],
    pure: true,
  },
  {
    id: "text.join",
    name: "Join text collection",
    description: "Joins a string collection using an editable separator.",
    inputs: [
      input("values", DataKind.StringArray, {
        defaultValue: [],
        role: "collection",
      }),
      stringInput("separator", ", "),
    ],
    outputs: [output("text", DataKind.String)],
    run: ({ values, separator }) => ({
      text: stringValues(values).join(String(separator)),
    }),
    examples: [
      {
        name: "Join tags",
        inputs: { values: ["red", "green", "blue"], separator: ", " },
        outputs: { text: "red, green, blue" },
      },
    ],
    pure: true,
  },
  {
    id: "json.value",
    name: "JSON value",
    description: "A directly editable JSON value.",
    inputs: [input("value", DataKind.Json, { defaultValue: {} })],
    outputs: [output("value", DataKind.Json)],
    run: ({ value }) => ({ value }),
    examples: [
      {
        name: "Editable object",
        inputs: { value: { name: "Ada", active: true } },
        outputs: { value: { name: "Ada", active: true } },
      },
    ],
    pure: true,
  },
  {
    id: "json.parse",
    name: "Parse JSON",
    description:
      "Parses text as JSON without failing the whole graph on invalid input.",
    inputs: [stringInput("text", "{}")],
    outputs: [
      output("value", DataKind.Json),
      output("valid", DataKind.Boolean, { role: "condition" }),
      output("error", DataKind.String),
    ],
    run: ({ text }) => {
      try {
        return { value: JSON.parse(String(text)), valid: true, error: "" };
      } catch (error) {
        return {
          value: null,
          valid: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
    examples: [
      {
        name: "Parse a payload",
        inputs: { text: '{"score":12}' },
        outputs: { value: { score: 12 }, valid: true, error: "" },
      },
    ],
    pure: true,
  },
  {
    id: "json.stringify",
    name: "Stringify JSON",
    description: "Serializes a JSON value as text.",
    inputs: [
      input("value", DataKind.Json, { defaultValue: null }),
      numberInput("spaces", 2, "Indentation"),
    ],
    outputs: [output("text", DataKind.String)],
    run: ({ value, spaces }) => ({
      text: JSON.stringify(
        value,
        null,
        Math.max(0, Math.trunc(Number(spaces))),
      ),
    }),
    constraints: ["indentation is clamped to a non-negative integer"],
    examples: [
      {
        name: "Pretty-print a payload",
        inputs: { value: { score: 12 }, spaces: 2 },
        outputs: { text: '{\n  "score": 12\n}' },
      },
    ],
    pure: true,
  },
  {
    id: "json.get",
    name: "Read JSON path",
    description: "Reads a dot path or numeric array index from a JSON value.",
    inputs: [
      input("value", DataKind.Json, { defaultValue: {} }),
      stringInput("path"),
    ],
    outputs: [
      output("value", DataKind.Json),
      output("exists", DataKind.Boolean, { role: "condition" }),
    ],
    run: ({ value, path }) => {
      const result = readPath(value, String(path));
      return { value: result.value, exists: result.exists };
    },
    examples: [
      {
        name: "Read a nested field",
        inputs: {
          value: { character: { name: "Ada" } },
          path: "character.name",
        },
        outputs: { value: "Ada", exists: true },
      },
    ],
    pure: true,
  },
  {
    id: "prompt.template",
    name: "Prompt template",
    description: "Renders {{path}} placeholders from a JSON context object.",
    inputs: [
      stringInput("template", "Describe {{subject}}."),
      input("context", DataKind.Json, {
        defaultValue: {},
        role: "context",
      }),
    ],
    outputs: [
      output("prompt", DataKind.String),
      output("missing", DataKind.StringArray, { role: "collection" }),
    ],
    run: ({ template, context }) => {
      const missing: string[] = [];
      const prompt = String(template).replace(
        /{{\s*([^}]+?)\s*}}/g,
        (_, path: string) => {
          const result = readPath(context, path);
          if (!result.exists) {
            missing.push(path);
            return `{{${path}}}`;
          }
          return formatPromptValue(result.value);
        },
      );
      return { prompt, missing };
    },
    examples: [
      {
        name: "Render structured context",
        inputs: {
          template: "Write about {{character.name}} in {{place}}.",
          context: { character: { name: "Ada" }, place: "London" },
        },
        outputs: { prompt: "Write about Ada in London.", missing: [] },
      },
    ],
    pure: true,
  },
  {
    id: "prompt.message",
    name: "Prompt message",
    description: "Builds one role/content message for a model conversation.",
    inputs: [stringInput("role", "user"), stringInput("content")],
    outputs: [output("message", DataKind.Object, { role: "context" })],
    run: ({ role, content }) => ({
      message: { role: String(role), content: String(content) },
    }),
    validate: ({ role }) => ({
      valid: ["system", "user", "assistant", "tool"].includes(String(role)),
      errors: ["system", "user", "assistant", "tool"].includes(String(role))
        ? undefined
        : ["Role must be system, user, assistant, or tool."],
    }),
    constraints: ["role must be system, user, assistant, or tool"],
    examples: [
      {
        name: "Build a user message",
        inputs: { role: "user", content: "Describe the scene." },
        outputs: { message: { role: "user", content: "Describe the scene." } },
      },
    ],
    pure: true,
  },
  {
    id: "prompt.messages",
    name: "Collect prompt messages",
    description:
      "Collects ordered prompt-message objects into a conversation array.",
    inputs: [
      input("messages", DataKind.ObjectArray, {
        accepts: [DataKind.Object, DataKind.ObjectArray],
        multiple: true,
        role: "context",
      }),
    ],
    outputs: [output("messages", DataKind.ObjectArray, { role: "context" })],
    run: ({ messages }) => ({ messages: contextValues(messages) }),
    examples: [
      {
        name: "Assemble a conversation",
        inputs: {
          messages: [
            { role: "system", content: "Be concise." },
            { role: "user", content: "Summarize this." },
          ],
        },
      },
    ],
    pure: true,
  },
  {
    id: "context.merge",
    name: "Merge context",
    description:
      "Merges ordered context objects; later inputs override earlier keys.",
    inputs: [
      input("contexts", DataKind.Object, {
        accepts: [DataKind.Object, DataKind.Dict, DataKind.DictArray],
        label: "Context",
        multiple: true,
        role: "context",
      }),
    ],
    outputs: [output("context", DataKind.Object, { role: "context" })],
    run: ({ contexts }) => ({
      context: Object.assign({}, ...contextValues(contexts)),
    }),
    examples: [
      {
        name: "Compose facet context",
        inputs: { contexts: [{ name: "Ada" }, { role: "analyst" }] },
        outputs: { context: { name: "Ada", role: "analyst" } },
      },
    ],
    pure: true,
  },
  {
    id: "context.pick",
    name: "Read context value",
    description: "Reads one key from a context object.",
    inputs: [
      input("context", DataKind.Object, { defaultValue: {}, role: "context" }),
      stringInput("key"),
    ],
    outputs: [output("value", DataKind.Any)],
    run: ({ context, key }) => ({
      value:
        typeof context === "object" &&
        context !== null &&
        !Array.isArray(context)
          ? ((context as Record<string, DataValue>)[String(key)] ?? null)
          : null,
    }),
    examples: [
      {
        name: "Read a facet",
        inputs: { context: { name: "Ada" }, key: "name" },
        outputs: { value: "Ada" },
      },
    ],
    pure: true,
  },
];

export function createBuiltinReducerRegistry(): ReducerRegistry {
  const registry = new ReducerRegistry();
  builtinReducers.forEach((reducer) => registry.register(reducer));
  return registry;
}
