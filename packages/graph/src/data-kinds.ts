/**
 * Type system for the computation graph.
 *
 * DataKind describes what kind of value flows through a socket.
 * Coercion rules define automatic conversions between kinds.
 */

export enum DataKind {
  Number = "number",
  String = "string",
  Boolean = "boolean",
  NumberArray = "number[]",
  StringArray = "string[]",
  BooleanArray = "boolean[]",
  Dict = "dict",
  DictArray = "dict[]",
  Object = "object",
  ObjectArray = "object[]",
  Json = "json",
  Any = "any",
}

export type Scalar = number | string | boolean;
export type Dict = { [key: string]: Scalar };
export type DataValue =
  | Scalar
  | Scalar[]
  | Dict
  | Dict[]
  | Record<string, unknown>
  | unknown;

// ─── Coercion ───────────────────────────────────────────────────────────────

const stringToBoolean = (value: string): boolean => {
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 && normalized !== "false";
};

type CoerceFn = (value: DataValue) => DataValue;

const COERCION_RULES: Record<DataKind, Partial<Record<DataKind, CoerceFn>>> = {
  [DataKind.Number]: {
    [DataKind.String]: (n) => String(n),
    [DataKind.Boolean]: (n) => (n as number) !== 0,
  },
  [DataKind.String]: {
    [DataKind.Number]: (s) => {
      const n = parseFloat(s as string);
      return isNaN(n) ? 0 : n;
    },
    [DataKind.Boolean]: (s) => stringToBoolean(s as string),
  },
  [DataKind.Boolean]: {
    [DataKind.Number]: (b) => (b ? 1 : 0),
    [DataKind.String]: (b) => String(b),
  },
  [DataKind.NumberArray]: {
    [DataKind.StringArray]: (arr) => (arr as number[]).map(String),
    [DataKind.BooleanArray]: (arr) => (arr as number[]).map((n) => n !== 0),
  },
  [DataKind.StringArray]: {
    [DataKind.NumberArray]: (arr) =>
      (arr as string[]).map((s) => {
        const n = parseFloat(s);
        return isNaN(n) ? 0 : n;
      }),
    [DataKind.BooleanArray]: (arr) =>
      (arr as string[]).map(stringToBoolean),
  },
  [DataKind.BooleanArray]: {
    [DataKind.NumberArray]: (arr) => (arr as boolean[]).map((b) => (b ? 1 : 0)),
    [DataKind.StringArray]: (arr) => (arr as boolean[]).map(String),
  },
  [DataKind.Dict]: {},
  [DataKind.DictArray]: {},
  [DataKind.Object]: {},
  [DataKind.ObjectArray]: {},
  [DataKind.Json]: {},
  [DataKind.Any]: {},
};

/** Check if a value of kind `from` can be coerced to kind `to` */
export function canCoerce(from: DataKind, to: DataKind): boolean {
  if (from === to || to === DataKind.Any || from === DataKind.Any) return true;
  if (to === DataKind.Json) return true;
  if (from === DataKind.Json) return to === DataKind.String;
  return COERCION_RULES[from]?.[to] !== undefined;
}

/** Coerce a value from one kind to another */
export function coerce(
  value: DataValue,
  from: DataKind,
  to: DataKind,
): DataValue {
  if (from === to || to === DataKind.Any || from === DataKind.Any) return value;
  if (to === DataKind.Json) return value;
  if (from === DataKind.Json && to === DataKind.String)
    return JSON.stringify(value);
  const fn = COERCION_RULES[from]?.[to];
  if (!fn) throw new Error(`Cannot coerce from ${from} to ${to}`);
  return fn(value);
}

/** Infer the DataKind of a runtime value */
export function inferKind(value: unknown): DataKind {
  if (value == null) return DataKind.Any;
  if (typeof value === "number") return DataKind.Number;
  if (typeof value === "string") return DataKind.String;
  if (typeof value === "boolean") return DataKind.Boolean;
  if (Array.isArray(value)) {
    if (value.length === 0) return DataKind.Any;
    const t = typeof value[0];
    if (value.every((v) => typeof v === t)) {
      if (t === "number") return DataKind.NumberArray;
      if (t === "string") return DataKind.StringArray;
      if (t === "boolean") return DataKind.BooleanArray;
      if (t === "object") return DataKind.ObjectArray;
    }
  }
  if (typeof value === "object") return DataKind.Object;
  return DataKind.Any;
}
