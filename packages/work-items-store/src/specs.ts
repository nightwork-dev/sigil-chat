import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { MarkdownStore } from "@mirk/store-markdown";
import { JsonFileStore } from "@workspace/file-store-core";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import { resolveRoadmapDir } from "./markdown-repository.js";

export type SpecStatus =
  "draft" | "review" | "accepted" | "superseded" | "archived";

export interface ProductSpec {
  id: string;
  title: string;
  summary: string;
  body: string;
  status: SpecStatus;
  storyIds: string[];
  supersedes?: string[];
  authoredBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface SpecFilter {
  status?: SpecStatus;
  storyId?: string;
}

export interface CreateSpecInput {
  id: string;
  title: string;
  summary: string;
  body: string;
  storyIds?: string[];
  supersedes?: string[];
  authoredBy: string;
}

export interface ReviseSpecInput {
  title?: string;
  summary?: string;
  body?: string;
  storyIds?: string[];
  supersedes?: string[];
}

export interface SpecMutationResult {
  revision: number;
  spec: ProductSpec;
  changedIds: string[];
}

export interface SpecsRepository {
  revision(): Promise<number>;
  list(filter?: SpecFilter): Promise<ProductSpec[]>;
  get(id: string): Promise<ProductSpec | undefined>;
  create(
    input: CreateSpecInput,
    expectedRevision?: number,
  ): Promise<SpecMutationResult>;
  revise(
    id: string,
    input: ReviseSpecInput,
    expectedRevision?: number,
  ): Promise<SpecMutationResult>;
  transition(
    id: string,
    status: SpecStatus,
    expectedRevision?: number,
  ): Promise<SpecMutationResult>;
}

export class MemorySpecsRepository implements SpecsRepository {
  private currentRevision = 0;
  private readonly records = new Map<string, ProductSpec>();

  constructor(
    specs: ProductSpec[] = [],
    private readonly now: () => string = () => new Date().toISOString(),
  ) {
    for (const spec of specs) {
      assertSpec(spec);
      this.records.set(spec.id, structuredClone(spec));
    }
  }

  async revision(): Promise<number> {
    return this.currentRevision;
  }

  async list(filter?: SpecFilter): Promise<ProductSpec[]> {
    return filterSpecs([...this.records.values()], filter);
  }

  async get(id: string): Promise<ProductSpec | undefined> {
    const spec = this.records.get(id);
    return spec ? structuredClone(spec) : undefined;
  }

  async create(
    input: CreateSpecInput,
    expectedRevision?: number,
  ): Promise<SpecMutationResult> {
    assertExpectedRevision(this.currentRevision, expectedRevision);
    assertSafeSpecId(input.id);
    if (this.records.has(input.id))
      throw new Error(`Spec id already exists: ${input.id}.`);
    const timestamp = this.now();
    const spec: ProductSpec = {
      ...structuredClone(input),
      body: normalizeSpecBody(input.body),
      status: "draft",
      storyIds: uniqueStrings(input.storyIds ?? []),
      ...(input.supersedes
        ? { supersedes: uniqueStrings(input.supersedes) }
        : {}),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    assertSpec(spec);
    this.records.set(spec.id, spec);
    this.currentRevision += 1;
    return result(this.currentRevision, spec);
  }

  async revise(
    id: string,
    input: ReviseSpecInput,
    expectedRevision?: number,
  ): Promise<SpecMutationResult> {
    assertExpectedRevision(this.currentRevision, expectedRevision);
    const existing = this.records.get(id);
    if (!existing) throw new Error(`Unknown spec id: ${id}.`);
    const spec: ProductSpec = {
      ...existing,
      ...structuredClone(input),
      ...(input.body ? { body: normalizeSpecBody(input.body) } : {}),
      ...(input.storyIds ? { storyIds: uniqueStrings(input.storyIds) } : {}),
      ...(input.supersedes
        ? { supersedes: uniqueStrings(input.supersedes) }
        : {}),
      updatedAt: this.now(),
    };
    assertSpec(spec);
    this.records.set(id, spec);
    this.currentRevision += 1;
    return result(this.currentRevision, spec);
  }

  async transition(
    id: string,
    status: SpecStatus,
    expectedRevision?: number,
  ): Promise<SpecMutationResult> {
    assertExpectedRevision(this.currentRevision, expectedRevision);
    const existing = this.records.get(id);
    if (!existing) throw new Error(`Unknown spec id: ${id}.`);
    if (existing.status === status)
      return {
        revision: this.currentRevision,
        spec: structuredClone(existing),
        changedIds: [],
      };
    const spec = { ...existing, status, updatedAt: this.now() };
    this.records.set(id, spec);
    this.currentRevision += 1;
    return result(this.currentRevision, spec);
  }
}

const SPECS_COLLECTION = "specs";
const SPECS_DIRECTORY = "specs";
const STATE_DIRECTORY = ".specs";
const LOCK_DIRECTORY = ".locks";
const STATE_FILE = "state.md";
const GIT_IDENTITY = [
  "-c",
  "user.name=Sigil Roadmap",
  "-c",
  "user.email=roadmap@sigil.local",
];

export class MirkSpecsRepository implements SpecsRepository {
  private readonly root: string;
  private readonly now: () => string;
  private readonly gitEnabled: boolean;
  private readonly store: MarkdownStore;
  private readonly writeLock: JsonFileStore<number>;
  private queue: Promise<unknown> = Promise.resolve();
  private ready?: Promise<void>;
  private gitAvailable = false;

  constructor(options?: { dir?: string; now?: () => string; git?: boolean }) {
    this.root = resolveRoadmapDir(process.env.SIGIL_ROADMAP_DIR, options?.dir);
    this.now = options?.now ?? (() => new Date().toISOString());
    this.gitEnabled = options?.git ?? true;
    this.writeLock = new JsonFileStore({
      filePath: join(this.root, LOCK_DIRECTORY, "specs"),
      lockLabel: "roadmap specs",
      createInitial: () => 0,
      parse: (value) => (typeof value === "number" ? value : undefined),
      corruptError: (path) =>
        new Error(`Spec write lock is corrupt at ${path}.`),
    });
    this.store = new MarkdownStore({
      rootDir: this.root,
      git: false,
      collections: {
        [SPECS_COLLECTION]: {
          directory: SPECS_DIRECTORY,
          frontmatterFields: [
            "title",
            "summary",
            "status",
            "storyIds",
            "supersedes",
            "authoredBy",
            "createdAt",
            "updatedAt",
          ],
          body: {
            sections: {
              body: {
                heading: "Specification",
                level: 1,
                parse: (markdown) => markdown.trim(),
                stringify: (value) => String(value).trim(),
              },
            },
          },
          index: {
            fileName: "index.md",
            heading: "Spec index",
            renderLine: (item) =>
              `- ${String(item.id)} · ${String(item.title)} · ${String(item.status)}`,
          },
        },
      },
    });
  }

  async revision(): Promise<number> {
    await this.ensureReady();
    return this.readRevision();
  }

  async list(filter?: SpecFilter): Promise<ProductSpec[]> {
    await this.ensureReady();
    const specsDirectory = join(this.root, SPECS_DIRECTORY);
    const entries = await readdir(specsDirectory);
    const specs: ProductSpec[] = [];
    for (const name of entries) {
      if (!name.endsWith(".md") || name === "index.md" || name.startsWith("_"))
        continue;
      const record = this.store.getById<ProductSpec>(
        SPECS_COLLECTION,
        name.slice(0, -3),
      );
      if (record === null) continue;
      if (!isSpec(record)) {
        console.warn(
          `[work-items] Skipping specs/${name}: not a valid spec record.`,
        );
        continue;
      }
      specs.push(record);
    }
    return filterSpecs(specs, filter);
  }

  async get(id: string): Promise<ProductSpec | undefined> {
    await this.ensureReady();
    assertSafeSpecId(id);
    const record = this.store.getById<ProductSpec>(SPECS_COLLECTION, id);
    if (record === null) return undefined;
    if (!isSpec(record)) throw new Error(`Spec record is corrupt: ${id}.`);
    return structuredClone(record);
  }

  async create(
    input: CreateSpecInput,
    expectedRevision?: number,
  ): Promise<SpecMutationResult> {
    return this.mutate(async (revision) => {
      assertSafeSpecId(input.id);
      if ((await this.get(input.id)) !== undefined)
        throw new Error(`Spec id already exists: ${input.id}.`);
      const timestamp = this.now();
      const spec: ProductSpec = {
        ...structuredClone(input),
        body: normalizeSpecBody(input.body),
        status: "draft",
        storyIds: uniqueStrings(input.storyIds ?? []),
        ...(input.supersedes
          ? { supersedes: uniqueStrings(input.supersedes) }
          : {}),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      assertSpec(spec);
      this.put(spec);
      return {
        nextRevision: revision + 1,
        spec,
        message: `spec ${spec.id}: create`,
      };
    }, expectedRevision);
  }

  async revise(
    id: string,
    input: ReviseSpecInput,
    expectedRevision?: number,
  ): Promise<SpecMutationResult> {
    return this.mutate(async (revision) => {
      const existing = await this.get(id);
      if (!existing) throw new Error(`Unknown spec id: ${id}.`);
      const spec: ProductSpec = {
        ...existing,
        ...structuredClone(input),
        ...(input.body ? { body: normalizeSpecBody(input.body) } : {}),
        ...(input.storyIds ? { storyIds: uniqueStrings(input.storyIds) } : {}),
        ...(input.supersedes
          ? { supersedes: uniqueStrings(input.supersedes) }
          : {}),
        updatedAt: this.now(),
      };
      assertSpec(spec);
      this.put(spec);
      return {
        nextRevision: revision + 1,
        spec,
        message: `spec ${id}: revise`,
      };
    }, expectedRevision);
  }

  async transition(
    id: string,
    status: SpecStatus,
    expectedRevision?: number,
  ): Promise<SpecMutationResult> {
    return this.mutate(async (revision) => {
      const existing = await this.get(id);
      if (!existing) throw new Error(`Unknown spec id: ${id}.`);
      if (existing.status === status)
        return { nextRevision: revision, spec: existing, message: "" };
      const spec = { ...existing, status, updatedAt: this.now() };
      this.put(spec);
      return {
        nextRevision: revision + 1,
        spec,
        message: `spec ${id}: ${existing.status}→${status}`,
      };
    }, expectedRevision);
  }

  private async mutate(
    operation: (revision: number) => Promise<{
      nextRevision: number;
      spec: ProductSpec;
      message: string;
    }>,
    expectedRevision?: number,
  ): Promise<SpecMutationResult> {
    return this.runExclusive(async () => {
      return this.writeLock.withWriteLock(async () => {
        await this.ensureReady();
        const revision = await this.readRevision();
        assertExpectedRevision(revision, expectedRevision);
        const change = await operation(revision);
        if (change.nextRevision === revision)
          return {
            revision,
            spec: structuredClone(change.spec),
            changedIds: [],
          };
        await this.writeRevision(change.nextRevision);
        this.commit(change.message);
        return result(change.nextRevision, change.spec);
      });
    });
  }

  private put(spec: ProductSpec): void {
    this.store.put<ProductSpec>(SPECS_COLLECTION, structuredClone(spec));
  }

  private runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.queue.then(operation, operation);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async ensureReady(): Promise<void> {
    this.ready ??= this.initialize();
    await this.ready;
  }

  private async initialize(): Promise<void> {
    await mkdir(join(this.root, SPECS_DIRECTORY), { recursive: true });
    await mkdir(join(this.root, STATE_DIRECTORY), { recursive: true });
    if (!existsSync(join(this.root, STATE_DIRECTORY, STATE_FILE)))
      await this.writeRevision(0);
    if (this.gitEnabled) this.gitAvailable = this.initializeGit();
  }

  private async readRevision(): Promise<number> {
    const raw = await readFile(
      join(this.root, STATE_DIRECTORY, STATE_FILE),
      "utf8",
    );
    const parsed = parseYaml(raw.replace(/^---\n|\n---\n?$/g, "")) as unknown;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed) ||
      typeof (parsed as { revision?: unknown }).revision !== "number"
    )
      throw new Error("Spec repository state is corrupt.");
    return (parsed as { revision: number }).revision;
  }

  private async writeRevision(revision: number): Promise<void> {
    await writeFile(
      join(this.root, STATE_DIRECTORY, STATE_FILE),
      `---\n${stringifyYaml({ revision, generatedAt: this.now() }).trimEnd()}\n---\n`,
      "utf8",
    );
  }

  private initializeGit(): boolean {
    if (!existsSync(join(this.root, ".git"))) return this.runGit(["init"]);
    return this.runGit(["rev-parse", "--git-dir"]);
  }

  private commit(message: string): void {
    if (!this.gitAvailable) return;
    if (!this.runGit(["add", "--", SPECS_DIRECTORY, STATE_DIRECTORY])) return;
    this.runGit([...GIT_IDENTITY, "commit", "-m", message], true);
  }

  private runGit(args: string[], allowFailure = false): boolean {
    try {
      execFileSync("git", ["-C", this.root, ...args], { stdio: "ignore" });
      return true;
    } catch (error) {
      if (!allowFailure)
        console.warn(
          `[work-items-store] git ${args.join(" ")} failed in ${this.root}; continuing without version history. ${(error as Error).message}`,
        );
      return false;
    }
  }
}

export const specsRepository: SpecsRepository = new MirkSpecsRepository();

export function isSpecStatus(value: unknown): value is SpecStatus {
  return (
    value === "draft" ||
    value === "review" ||
    value === "accepted" ||
    value === "superseded" ||
    value === "archived"
  );
}

export function isSpec(value: unknown): value is ProductSpec {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const spec = value as Partial<ProductSpec>;
  return (
    typeof spec.id === "string" &&
    isSafeSpecId(spec.id) &&
    isNonEmptyString(spec.title) &&
    isNonEmptyString(spec.summary) &&
    isNonEmptyString(spec.body) &&
    !/^#\s/m.test(spec.body) &&
    isSpecStatus(spec.status) &&
    isStringArray(spec.storyIds) &&
    (spec.supersedes === undefined || isStringArray(spec.supersedes)) &&
    isNonEmptyString(spec.authoredBy) &&
    isNonEmptyString(spec.createdAt) &&
    isNonEmptyString(spec.updatedAt)
  );
}

function assertSpec(spec: unknown): asserts spec is ProductSpec {
  if (!isSpec(spec)) throw new Error("Invalid spec record.");
}

function assertSafeSpecId(id: string): void {
  if (!isSafeSpecId(id)) throw new Error(`Unsafe spec id: ${id}.`);
}

function isSafeSpecId(id: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id);
}

function assertExpectedRevision(current: number, expected?: number): void {
  if (expected !== undefined && expected !== current)
    throw new Error(
      `Specs revision conflict: expected ${expected}, current ${current}.`,
    );
}

function filterSpecs(specs: ProductSpec[], filter?: SpecFilter): ProductSpec[] {
  return specs
    .filter(
      (spec) =>
        (!filter?.status || spec.status === filter.status) &&
        (!filter?.storyId || spec.storyIds.includes(filter.storyId)),
    )
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
    .map((spec) => structuredClone(spec));
}

function result(revision: number, spec: ProductSpec): SpecMutationResult {
  return { revision, spec: structuredClone(spec), changedIds: [spec.id] };
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function normalizeSpecBody(body: string): string {
  const trimmed = body.trim();
  const withoutTitle = trimmed.replace(/^#\s+[^\n]+\n+/, "").trim();
  if (/^#\s/m.test(withoutTitle))
    throw new Error(
      "Spec bodies use the record title as their level-one heading; body headings must start at level two.",
    );
  return withoutTitle;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
