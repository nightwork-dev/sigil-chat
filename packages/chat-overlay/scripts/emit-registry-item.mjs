import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  filesRoot,
  packageRoot,
  stageOverlay,
  walkStagedFiles,
} from "./stage-overlay.mjs";

const outputPath = join(packageRoot, "dist", "chat-overlay.registry.json");

export function emitRegistryItem({ output = outputPath } = {}) {
  stageOverlay();

  const packageJson = JSON.parse(
    readFileSync(join(packageRoot, "package.json"), "utf8"),
  );
  const manifest = JSON.parse(
    readFileSync(join(packageRoot, "overlay.sigil.json"), "utf8"),
  );
  const fileEntries = walkStagedFiles(filesRoot).map((filePath) => {
    const content = readFileSync(filePath);
    return {
      path: relative(filesRoot, filePath).replaceAll("\\", "/"),
      content: content.toString("base64"),
      encoding: "base64",
    };
  });

  const digestInput = {
    name: "chat-overlay",
    version: packageJson.version,
    overlay: manifest,
    files: [...fileEntries].sort((a, b) => a.path.localeCompare(b.path)),
  };
  const digest = `sha256-${sha256Base64Url(
    Buffer.from(stableJson(digestInput), "utf8"),
  )}`;
  const item = {
    $schema: "https://ui.nightwork.dev/schemas/sigil-overlay-registry-item.v1.json",
    name: "chat-overlay",
    version: packageJson.version,
    digest,
    overlay: manifest,
    files: fileEntries,
  };

  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(item, null, 2)}\n`, "utf8");
  return { item, output };
}

function sha256Base64Url(content) {
  return createHash("sha256").update(content).digest("base64url");
}

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { item, output } = emitRegistryItem();
  if (!existsSync(output)) {
    throw new Error(`Registry item was not written: ${output}`);
  }
  console.log(
    `Wrote ${relative(process.cwd(), output)} (${item.files.length} files, ${item.digest})`,
  );
}
