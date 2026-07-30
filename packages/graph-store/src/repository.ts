import { SqliteAdapter } from "@mirk/store/sqlite";
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
import { existsSync, readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";

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

export const GRAPH_RECORD_KEY = "graph-store/document";

export class FileGraphRepository implements GraphRepository {
  readonly filePath: string;
  readonly databasePath: string;
  private store: Promise<SqliteAdapter> | undefined;

  constructor(storePath = resolveGraphStorePath()) {
    this.filePath = resolveGraphLegacyPath(storePath);
    this.databasePath = resolveGraphDatabasePath(storePath);
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
    const adapter = await this.getStore();
    while (true) {
      const state = await this.readState();
      assertRevision(state.current, expectedRevision);
      const plan = await planGraphCommands(
        state.current,
        commands,
        createBuiltinReducerRegistry(),
      );
      if (!plan.valid || !plan.document) return { applied: false, plan };
      const next = plan.document;
      if (commands.length === 0) {
        return { applied: true, document: cloneDocument(next), plan };
      }
      const result = commitGraphStateInSynchronousTransaction({
        adapter,
        corruptionPath: this.databasePath,
        expectedSnapshotRevision: state.current.revision,
        expectedRevision,
        nextState: {
          current: next,
          history: [...state.history, state.current].slice(-100),
        },
      });
      if (result.committed) {
        return { applied: true, document: cloneDocument(next), plan };
      }
    }
  }

  async undo(expectedRevision?: number): Promise<ReducerGraphDocument> {
    const adapter = await this.getStore();
    return cloneDocument(
      adapter.transaction(() => {
        const state = readStoredGraphInTransaction(adapter, this.databasePath);
        assertRevision(state.current, expectedRevision);
        const previous = state.history.at(-1);
        if (!previous) return state.current;
        const next = {
          ...cloneDocument(previous),
          revision: state.current.revision + 1,
        };
        // Intentionally discard the result; this only verifies that the restored document can be materialized.
        materializeGraph(next, createBuiltinReducerRegistry());
        adapter.kv.set(GRAPH_RECORD_KEY, {
          current: next,
          history: state.history.slice(0, -1),
        });
        return next;
      }, "immediate"),
    );
  }

  async run(): Promise<ReducerGraphRun> {
    return runGraphDocument(await this.get(), createBuiltinReducerRegistry());
  }

  private async readState(): Promise<StoredGraph> {
    const adapter = await this.getStore();
    return readStoredGraph(adapter, this.databasePath);
  }

  private getStore(): Promise<SqliteAdapter> {
    return (this.store ??= openGraphStore(this.databasePath, this.filePath));
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

export function resolveGraphDatabasePath(
  storePath = resolveGraphStorePath(),
): string {
  const directory =
    extname(storePath) === ".json" ? dirname(storePath) : storePath;
  return join(directory, "graph.sqlite");
}

type GraphCommitResult =
  | { committed: true }
  | { committed: false; actualRevision: number };

function commitGraphStateInSynchronousTransaction(input: {
  adapter: SqliteAdapter;
  corruptionPath: string;
  expectedSnapshotRevision: number;
  expectedRevision?: number;
  nextState: StoredGraph;
}): GraphCommitResult {
  return input.adapter.transaction(() => {
    const current = readStoredGraphInTransaction(
      input.adapter,
      input.corruptionPath,
    );
    assertRevision(current.current, input.expectedRevision);
    if (current.current.revision !== input.expectedSnapshotRevision) {
      return {
        committed: false,
        actualRevision: current.current.revision,
      };
    }
    input.adapter.kv.set(GRAPH_RECORD_KEY, input.nextState);
    return { committed: true };
  }, "immediate");
}

async function openGraphStore(
  databasePath: string,
  legacyPath: string,
): Promise<SqliteAdapter> {
  await mkdir(dirname(databasePath), { recursive: true });
  const adapter = new SqliteAdapter({ path: databasePath });
  try {
    if (!adapter.kv.has(GRAPH_RECORD_KEY)) {
      const legacy = readLegacyGraph(legacyPath);
      if (legacy !== undefined) {
        adapter.transaction(() => {
          if (!adapter.kv.has(GRAPH_RECORD_KEY)) {
            adapter.kv.set(GRAPH_RECORD_KEY, legacy);
          }
        }, "immediate");
      }
    }
    return adapter;
  } catch (error) {
    adapter.close();
    throw error;
  }
}

function readStoredGraph(
  adapter: SqliteAdapter,
  corruptionPath: string,
): StoredGraph {
  const stored = readStoredValue(adapter, corruptionPath);
  if (stored !== null) return parseStoredGraph(stored, corruptionPath);

  const initial = createInitialGraphState();
  return adapter.transaction(() => {
    const current = readStoredValue(adapter, corruptionPath);
    if (current === null) {
      adapter.kv.set(GRAPH_RECORD_KEY, initial);
      return initial;
    }
    return parseStoredGraph(current, corruptionPath);
  }, "immediate");
}

function readStoredGraphInTransaction(
  adapter: SqliteAdapter,
  corruptionPath: string,
): StoredGraph {
  const stored = readStoredValue(adapter, corruptionPath);
  if (stored === null) {
    const initial = createInitialGraphState();
    adapter.kv.set(GRAPH_RECORD_KEY, initial);
    return initial;
  }
  return parseStoredGraph(stored, corruptionPath);
}

function readStoredValue(
  adapter: SqliteAdapter,
  corruptionPath: string,
): unknown | null {
  try {
    return adapter.kv.get<unknown>(GRAPH_RECORD_KEY);
  } catch {
    throw corruptStoreError(corruptionPath);
  }
}

function readLegacyGraph(legacyPath: string): StoredGraph | undefined {
  let raw: string;
  try {
    raw = readFileSync(legacyPath, "utf8");
  } catch (error) {
    if (isMissingFile(error)) return undefined;
    throw error;
  }

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw corruptStoreError(legacyPath);
  }
  return parseStoredGraph(value, legacyPath);
}

function parseStoredGraph(value: unknown, corruptionPath: string): StoredGraph {
  if (!isStoredGraph(value)) throw corruptStoreError(corruptionPath);
  return { current: value.current, history: value.history ?? [] };
}

function createInitialGraphState(): StoredGraph {
  return { current: cloneDocument(sampleReducerGraph), history: [] };
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

function resolveGraphLegacyPath(storePath: string): string {
  return extname(storePath) === ".json"
    ? storePath
    : join(storePath, "reducer-graph.json");
}

function resolveWorkspaceDataPath(input: {
  envPath?: string;
  relativePath: string;
  rootPackageName: string;
  startDirectory?: string;
}): string {
  if (input.envPath) return resolve(input.envPath);
  const startDirectory = input.startDirectory ?? process.cwd();
  let directory = resolve(startDirectory);
  while (true) {
    const packagePath = join(directory, "package.json");
    if (existsSync(packagePath)) {
      try {
        const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as {
          name?: string;
        };
        if (packageJson.name === input.rootPackageName) {
          return join(directory, input.relativePath);
        }
      } catch {
        // Keep walking; an unrelated malformed package file is not the root.
      }
    }
    const parent = dirname(directory);
    if (parent === directory)
      return join(resolve(startDirectory), input.relativePath);
    directory = parent;
  }
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function corruptStoreError(filePath: string): Error {
  return new Error(
    `Graph store is corrupt at "${filePath}". Expected a graph document with id, revision, nodes, and edges arrays.`,
  );
}
