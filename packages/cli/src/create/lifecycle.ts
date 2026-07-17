import { spawnSync } from "node:child_process";
import { join } from "node:path";

export type PackageManager = "pnpm" | "npm" | "yarn" | "bun";

export interface CommandRunner {
  (command: string, args: string[], cwd: string): void;
}

export interface LifecycleOptions {
  cwd: string;
  packageManager: PackageManager;
  postCreate?: string[];
  install: boolean;
  git: boolean;
  verify: boolean;
  runner?: CommandRunner;
}

export interface LifecycleResult {
  commands: string[];
}

const PACKAGE_MANAGERS = new Set<PackageManager>([
  "pnpm",
  "npm",
  "yarn",
  "bun",
]);

export function parsePackageManager(value: string): PackageManager {
  if (!PACKAGE_MANAGERS.has(value as PackageManager)) {
    throw new Error(
      `Unsupported package manager "${value}". Expected pnpm, npm, yarn, or bun.`,
    );
  }
  return value as PackageManager;
}

export function runLifecycle(options: LifecycleOptions): LifecycleResult {
  const runner = options.runner ?? runCommand;
  const commands: string[] = [];
  let installed = false;

  for (const raw of options.postCreate ?? []) {
    const parts = splitCommand(raw);
    if (parts.length === 0) continue;
    const isInstall = isInstallCommand(parts);
    if (isInstall && !options.install) continue;
    if (isInstall) {
      parts[0] = options.packageManager;
      installed = true;
    }
    execute(parts, options.cwd, runner, commands);
  }

  if (options.install && !installed) {
    execute([options.packageManager, "install"], options.cwd, runner, commands);
  }
  if (options.git) execute(["git", "init"], options.cwd, runner, commands);
  if (options.verify) {
    // The template deliberately excludes the generated TanStack route tree.
    // Loading the real Vite build regenerates it before TypeScript consumes the
    // route types and catches integration failures a bare tsc pass would miss.
    execute(
      [join(options.cwd, "apps/web/node_modules/.bin/vite"), "build"],
      join(options.cwd, "apps/web"),
      runner,
      commands,
    );
    const args =
      options.packageManager === "npm"
        ? ["npm", "run", "typecheck"]
        : [options.packageManager, "typecheck"];
    execute(args, options.cwd, runner, commands);
  }

  return { commands };
}

function isInstallCommand(parts: string[]): boolean {
  return (
    PACKAGE_MANAGERS.has(parts[0] as PackageManager) && parts[1] === "install"
  );
}

function execute(
  parts: string[],
  cwd: string,
  runner: CommandRunner,
  commands: string[],
): void {
  const [command, ...args] = parts;
  runner(command, args, cwd);
  commands.push(parts.join(" "));
}

function runCommand(command: string, args: string[], cwd: string): void {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `Command failed (${result.status ?? "unknown"}): ${[command, ...args].join(" ")}`,
    );
}

// Manifest commands are intentionally simple argv, not shell programs. This keeps
// post-create hooks portable and prevents shell interpolation surprises.
function splitCommand(command: string): string[] {
  return command.trim().split(/\s+/).filter(Boolean);
}
