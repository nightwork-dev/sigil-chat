import { readFileSync } from "node:fs";

export const imageKeys = [
  "SIGIL_EVE_IMAGE",
  "SIGIL_GONK_IMAGE",
  "SIGIL_MIGRATE_IMAGE",
  "SIGIL_WEB_IMAGE",
];

const digestPattern =
  /^ghcr\.io\/[a-z0-9._-]+\/sigil-chat-(eve|gonk|migrate|web)@sha256:[a-f0-9]{64}$/;

export function parseImageManifest(source) {
  const values = new Map();

  for (const rawLine of source.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator < 1) throw new Error(`Invalid manifest line: ${line}`);

    const key = line.slice(0, separator);
    const value = line.slice(separator + 1);
    if (!imageKeys.includes(key))
      throw new Error(`Unexpected manifest key: ${key}`);
    if (values.has(key)) throw new Error(`Duplicate manifest key: ${key}`);
    const match = digestPattern.exec(value);
    if (!match)
      throw new Error(`Image is not an immutable GHCR digest: ${key}`);
    if (`SIGIL_${match[1].toUpperCase()}_IMAGE` !== key) {
      throw new Error(`Image target does not match manifest key: ${key}`);
    }
    values.set(key, value);
  }

  for (const key of imageKeys) {
    if (!values.has(key)) throw new Error(`Missing manifest key: ${key}`);
  }

  return Object.fromEntries(values);
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const path = process.argv[2];
  if (!path)
    throw new Error("Usage: node verify-release.mjs <sigil-images.env>");
  parseImageManifest(readFileSync(path, "utf8"));
  process.stdout.write("release manifest valid\n");
}
