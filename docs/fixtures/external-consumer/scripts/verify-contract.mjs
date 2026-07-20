import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const packageJson = JSON.parse(
  await readFile(join(root, "package.json"), "utf8"),
);
const compatibilityTrain = JSON.parse(
  await readFile(join(root, "compatibility-train.json"), "utf8"),
);
const exactDependencies = compatibilityTrain.verifiedPublicBoundary;

for (const [name, version] of Object.entries(exactDependencies)) {
  if (packageJson.dependencies[name] !== version)
    throw new Error(`${name} must be pinned to ${version}`);
}

for (const dependencySection of [
  packageJson.dependencies,
  packageJson.devDependencies,
  packageJson.optionalDependencies,
  packageJson.peerDependencies,
]) {
  for (const specifier of Object.values(dependencySection ?? {})) {
    if (
      typeof specifier === "string" &&
      /workspace:|link:|file:/.test(specifier)
    ) {
      throw new Error("Fixture dependencies must resolve from the registry");
    }
  }
}

const fixtureSources = [
  await readFile(join(root, "package.json"), "utf8"),
  await readFile(join(root, "compatibility-train.json"), "utf8"),
  ...(await sourceTexts(join(root, "agent"))),
  ...(await sourceTexts(join(root, "gonk"))),
  ...(await sourceTexts(join(root, "scripts"))),
];

for (const text of fixtureSources) {
  if (
    /workspace:|@workspace\//.test(text) ||
    text.includes("fi" + "le:") ||
    /from\s+["'][^"']*apps\//.test(text)
  ) {
    throw new Error(
      "Fixture contains a forbidden local dependency or product import",
    );
  }
}

console.log("external-consumer fixture contract verified");

async function sourceTexts(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const texts = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) texts.push(...(await sourceTexts(path)));
    else if (
      /\.(?:[cm]?js|ts|json)$/.test(entry.name) &&
      path !== new URL(import.meta.url).pathname
    ) {
      texts.push(await readFile(path, "utf8"));
    }
  }
  return texts;
}
