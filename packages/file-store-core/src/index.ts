import { existsSync, readFileSync } from "node:fs";
import {
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const DEFAULT_LOCK_TIMEOUT_MS = 2_000;
const DEFAULT_HARD_STALE_MS = 60_000;

export interface JsonFileStoreOptions<T> {
  filePath: string;
  createInitial: () => T;
  parse: (value: unknown) => T | undefined;
  corruptError: (filePath: string) => Error;
  lockLabel: string;
  lockTimeoutMs?: number;
  hardStaleMs?: number;
}

export class JsonFileStore<T> {
  readonly filePath: string;
  private readonly options: JsonFileStoreOptions<T>;

  constructor(options: JsonFileStoreOptions<T>) {
    this.filePath = options.filePath;
    this.options = options;
  }

  async read(): Promise<T> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, "utf8");
    } catch (error) {
      if (!isMissingFile(error)) throw error;
      const initial = this.options.createInitial();
      await this.write(initial);
      return initial;
    }

    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      throw this.options.corruptError(this.filePath);
    }
    const parsed = this.options.parse(value);
    if (parsed === undefined) throw this.options.corruptError(this.filePath);
    return parsed;
  }

  async write(value: T): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(
      temporaryPath,
      `${JSON.stringify(value, null, 2)}\n`,
      "utf8",
    );
    await rename(temporaryPath, this.filePath);
  }

  async withWriteLock<TResult>(
    operation: () => Promise<TResult>,
  ): Promise<TResult> {
    const lockPath = `${this.filePath}.lock`;
    await mkdir(dirname(lockPath), { recursive: true });
    const lockTimeoutMs = this.options.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;
    const deadline = Date.now() + lockTimeoutMs;

    while (Date.now() < deadline) {
      let lock;
      try {
        lock = await open(lockPath, "wx");
      } catch (error) {
        if (!isAlreadyExists(error)) throw error;
        if (
          await reapStaleLock(
            lockPath,
            this.options.hardStaleMs ?? DEFAULT_HARD_STALE_MS,
          )
        ) {
          continue;
        }
        const remaining = deadline - Date.now();
        if (remaining <= 0) break;
        await new Promise((resolveDelay) =>
          setTimeout(resolveDelay, Math.min(20, remaining)),
        );
        continue;
      }

      try {
        await lock.writeFile(
          JSON.stringify({ pid: process.pid, createdAt: Date.now() }),
          "utf8",
        );
        return await operation();
      } finally {
        try {
          await lock.close();
        } finally {
          await rm(lockPath, { force: true });
        }
      }
    }

    throw new Error(
      `Could not acquire the ${this.options.lockLabel} store lock at "${lockPath}" within ${lockTimeoutMs}ms. If no writer is running, deleting "${lockPath}" is safe.`,
    );
  }
}

export function resolveWorkspaceDataPath(input: {
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

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isMissingFile(error: unknown): boolean {
  return isErrorCode(error, "ENOENT");
}

function isAlreadyExists(error: unknown): boolean {
  return isErrorCode(error, "EEXIST");
}

function parseLockMetadata(
  raw: string,
): { pid: number; createdAt: number } | undefined {
  try {
    const value: unknown = JSON.parse(raw);
    if (
      !isRecord(value) ||
      typeof value.pid !== "number" ||
      !Number.isInteger(value.pid) ||
      value.pid <= 0 ||
      typeof value.createdAt !== "number" ||
      !Number.isFinite(value.createdAt)
    ) {
      return undefined;
    }
    return { pid: value.pid, createdAt: value.createdAt };
  } catch {
    return undefined;
  }
}

async function reapStaleLock(
  lockPath: string,
  hardStaleMs: number,
): Promise<boolean> {
  let raw: string;
  let lockStats: Awaited<ReturnType<typeof stat>>;
  try {
    [raw, lockStats] = await Promise.all([
      readFile(lockPath, "utf8"),
      stat(lockPath),
    ]);
  } catch (error) {
    if (isMissingFile(error)) return true;
    throw error;
  }

  const metadata = parseLockMetadata(raw);
  const now = Date.now();
  const staleByAge =
    now - lockStats.mtimeMs > hardStaleMs ||
    (metadata !== undefined && now - metadata.createdAt > hardStaleMs);
  const heldByDeadProcess =
    metadata !== undefined && isProcessDead(metadata.pid);
  if (!heldByDeadProcess && !staleByAge) return false;

  try {
    await rm(lockPath);
  } catch (error) {
    if (!isMissingFile(error)) throw error;
  }
  return true;
}

function isProcessDead(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return isErrorCode(error, "ESRCH");
  }
}

function isErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
