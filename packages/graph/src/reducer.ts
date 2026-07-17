import type { SocketDefinition } from "@workspace/graph/socket";
import type { DataValue } from "@workspace/graph/data-kinds";

export type InputValues = Record<string, DataValue>;
export type OutputValues = Record<string, DataValue>;

export interface ExecutionContext {
  timestamp: number;
  executionId: string;
}

export interface Reducer {
  id: string;
  name: string;
  description: string;
  inputs: SocketDefinition[];
  outputs: SocketDefinition[];
  run: (
    inputs: InputValues,
    ctx: ExecutionContext,
  ) => OutputValues | Promise<OutputValues>;
  validate?: (inputs: InputValues) => { valid: boolean; errors?: string[] };
  constraints?: string[];
  examples?: Array<{
    name: string;
    inputs: InputValues;
    outputs?: OutputValues;
  }>;
  pure?: boolean;
  async?: boolean;
}

/**
 * Registry of available reducers.
 * Auto-categorizes by naming convention: "math.add" → category "Math".
 */
export class ReducerRegistry {
  private reducers = new Map<string, Reducer>();

  register(reducer: Reducer): void {
    this.reducers.set(reducer.id, reducer);
  }

  get(id: string): Reducer | undefined {
    return this.reducers.get(id);
  }

  all(): Reducer[] {
    return Array.from(this.reducers.values());
  }

  /** Group reducers by category (derived from ID prefix before first dot) */
  categories(): Map<string, Reducer[]> {
    const cats = new Map<string, Reducer[]>();
    for (const reducer of this.reducers.values()) {
      const dotIndex = reducer.id.indexOf(".");
      const category =
        dotIndex > 0
          ? reducer.id.slice(0, dotIndex).charAt(0).toUpperCase() +
            reducer.id.slice(1, dotIndex)
          : "General";
      const list = cats.get(category) ?? [];
      list.push(reducer);
      cats.set(category, list);
    }
    return cats;
  }

  /** Search reducers by name, description, or ID */
  search(query: string): Reducer[] {
    const q = query.toLowerCase();
    return this.all().filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q),
    );
  }
}
