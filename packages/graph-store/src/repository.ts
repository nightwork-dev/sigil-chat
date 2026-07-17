import {
  isRecord,
  JsonFileStore,
  resolveWorkspaceDataPath,
} from "@workspace/file-store-core";
import { createBuiltinReducerRegistry } from "@workspace/graph/builtins";
import {
  materializeGraph,
  planGraphCommands,
  runGraphDocument,
  type ReducerGraphCommand,
  type ReducerGraphDocument,
  type ReducerGraphPlan,
  type ReducerGraphRun,
} from "@workspace/graph/document";
import { sampleReducerGraph } from "@workspace/graph/sample";
import { readStorageEnvironment } from "@workspace/runtime-env/server";

interface StoredGraph {
  current: ReducerGraphDocument;
  history: ReducerGraphDocument[];
}

export interface GraphRepository {
  get(): Promise<ReducerGraphDocument>;
  apply(
    command: ReducerGraphCommand,
    expectedRevision?: number,
  ): Promise<ReducerGraphDocument>;
  plan(
    commands: ReducerGraphCommand[],
    expectedRevision?: number,
  ): Promise<ReducerGraphPlan>;
  applyBatch(
    commands: ReducerGraphCommand[],
    expectedRevision?: number,
  ): Promise<GraphBatchResult>;
  undo(expectedRevision?: number): Promise<ReducerGraphDocument>;
  run(): Promise<ReducerGraphRun>;
}

export type GraphBatchResult =
  | { applied: true; document: ReducerGraphDocument; plan: ReducerGraphPlan }
  | { applied: false; plan: ReducerGraphPlan };

export class FileGraphRepository implements GraphRepository {
  readonly filePath: string;
  private readonly store: JsonFileStore<StoredGraph>;

  constructor(filePath = resolveGraphStorePath()) {
    this.filePath = filePath;
    this.store = new JsonFileStore({
      filePath,
      lockLabel: "graph",
      createInitial: () => ({
        current: cloneDocument(sampleReducerGraph),
        history: [],
      }),
      parse: (value) =>
        isStoredGraph(value)
          ? { current: value.current, history: value.history ?? [] }
          : undefined,
      corruptError: corruptStoreError,
    });
  }

  async get(): Promise<ReducerGraphDocument> {
    return cloneDocument((await this.readState()).current);
  }

  async apply(
    command: ReducerGraphCommand,
    expectedRevision?: number,
  ): Promise<ReducerGraphDocument> {
    const result = await this.applyBatch([command], expectedRevision);
    if (!result.applied) {
      throw new Error(
        result.plan.issues.map(({ message }) => message).join(" "),
      );
    }
    return result.document;
  }

  async plan(
    commands: ReducerGraphCommand[],
    expectedRevision?: number,
  ): Promise<ReducerGraphPlan> {
    const state = await this.readState();
    assertRevision(state.current, expectedRevision);
    return planGraphCommands(
      state.current,
      commands,
      createBuiltinReducerRegistry(),
    );
  }

  async applyBatch(
    commands: ReducerGraphCommand[],
    expectedRevision?: number,
  ): Promise<GraphBatchResult> {
    return this.withWriteLock(async () => {
      const state = await this.readState();
      assertRevision(state.current, expectedRevision);
      const plan = await planGraphCommands(
        state.current,
        commands,
        createBuiltinReducerRegistry(),
      );
      if (!plan.valid || !plan.document) return { applied: false, plan };
      const next = plan.document;
      if (commands.length > 0) {
        await this.writeState({
          current: next,
          history: [...state.history, state.current].slice(-100),
        });
      }
      return { applied: true, document: cloneDocument(next), plan };
    });
  }

  async undo(expectedRevision?: number): Promise<ReducerGraphDocument> {
    return this.withWriteLock(async () => {
      const state = await this.readState();
      assertRevision(state.current, expectedRevision);
      const previous = state.history.at(-1);
      if (!previous) return cloneDocument(state.current);
      const next = {
        ...cloneDocument(previous),
        revision: state.current.revision + 1,
      };
      // Intentionally discard the result; this only verifies that the restored document can be materialized.
      materializeGraph(next, createBuiltinReducerRegistry());
      await this.writeState({
        current: next,
        history: state.history.slice(0, -1),
      });
      return cloneDocument(next);
    });
  }

  async run(): Promise<ReducerGraphRun> {
    return runGraphDocument(await this.get(), createBuiltinReducerRegistry());
  }

  private async readState(): Promise<StoredGraph> {
    return this.store.read();
  }

  private async writeState(state: StoredGraph): Promise<void> {
    await this.store.write(state);
  }

  private async withWriteLock<T>(operation: () => Promise<T>): Promise<T> {
    return this.store.withWriteLock(operation);
  }
}

export const graphRepository = new FileGraphRepository();

export function resolveGraphStorePath(startDirectory = process.cwd()): string {
  return resolveWorkspaceDataPath({
    envPath: readStorageEnvironment(process.env).graphPath,
    relativePath: ".data/reducer-graph.json",
    rootPackageName: "sigil-chat",
    startDirectory,
  });
}

function assertRevision(
  document: ReducerGraphDocument,
  expectedRevision?: number,
): void {
  if (
    expectedRevision !== undefined &&
    document.revision !== expectedRevision
  ) {
    throw new Error(
      `Graph revision conflict: expected ${expectedRevision}, found ${document.revision}.`,
    );
  }
}

function cloneDocument(document: ReducerGraphDocument): ReducerGraphDocument {
  return structuredClone(document);
}

function isStoredGraph(value: unknown): value is {
  current: ReducerGraphDocument;
  history?: ReducerGraphDocument[];
} {
  if (!isRecord(value) || !isGraphDocument(value.current)) return false;
  return (
    value.history === undefined ||
    (Array.isArray(value.history) && value.history.every(isGraphDocument))
  );
}

function isGraphDocument(value: unknown): value is ReducerGraphDocument {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.revision === "number" &&
    Array.isArray(value.nodes) &&
    Array.isArray(value.edges)
  );
}

function corruptStoreError(filePath: string): Error {
  return new Error(
    `Graph store is corrupt at "${filePath}". Expected a graph document with id, revision, nodes, and edges arrays.`,
  );
}
