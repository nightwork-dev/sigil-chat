import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { migrateLegacyStoryMarkdown } from "../src/migrations.js";

const directoryArgument = process.argv.find((argument) =>
  argument.startsWith("--dir="),
);
const directory = resolve(
  directoryArgument?.slice("--dir=".length) ??
    process.env.SIGIL_ROADMAP_DIR ??
    "../sigil-roadmap",
);
const write = process.argv.includes("--write");
const changed: string[] = [];

for (const name of await readdir(directory)) {
  if (!name.endsWith(".md") || name === "index.md" || name.startsWith("_"))
    continue;
  const path = resolve(directory, name);
  const raw = await readFile(path, "utf8");
  const migrated = migrateLegacyStoryMarkdown(raw);
  if (migrated === undefined) continue;
  changed.push(name);
  if (write) await writeFile(path, migrated, "utf8");
}

console.log(
  JSON.stringify({ directory, mode: write ? "write" : "dry-run", changed }),
);
