import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import {
  collectToolOutcome,
  makeBaseContext,
  ToolRegistry,
} from "@gonk/tool-registry";
import { FileObjectStore } from "@mirk/artifact/fs";

import { SessionArtifactStore } from "../src/artifact-store.js";
import { registerEvidenceTools } from "../src/registry/evidence.js";

const cliArgs = process.argv.slice(2);
if (cliArgs[0] === "--") cliArgs.shift();
const [sourcePath, ...questionParts] = cliArgs;
const question = questionParts.join(" ").trim();

if (!sourcePath || !question) {
  throw new Error(
    "Usage: pnpm --filter sigil-chat-gonk demo:evidence -- <source-file> <question>",
  );
}

const directory = await mkdtemp(join(tmpdir(), "sigil-evidence-demo-"));

try {
  const bytes = await readFile(sourcePath);
  const artifacts = new SessionArtifactStore(
    new FileObjectStore({ root: directory }),
  );
  await artifacts.putFile({
    bytes,
    filename: basename(sourcePath),
    mediaType: "text/markdown",
    scope: "evidence-demo",
  });

  const registry = new ToolRegistry();
  registerEvidenceTools(registry, artifacts);
  const outcome = await collectToolOutcome(
    registry.invoke(
      "sigil-evidence-ask",
      { question },
      makeBaseContext({ host: { sessionScope: "evidence-demo" } }),
    ),
  );

  process.stdout.write(`${JSON.stringify(outcome, null, 2)}\n`);
  if (!outcome.ok) process.exitCode = 1;
} finally {
  await rm(directory, { recursive: true, force: true });
}
