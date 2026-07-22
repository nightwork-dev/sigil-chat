import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export function resolveSigilProjectRoot(startDirectory: string): string {
  let directory = resolve(startDirectory);
  while (true) {
    const packagePath = join(directory, "package.json");
    const fixturePath = join(
      directory,
      "fixtures",
      "application",
      "sigil-chat.yaml",
    );
    if (existsSync(fixturePath)) return directory;
    if (existsSync(packagePath)) {
      try {
        const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as {
          name?: string;
        };
        if (packageJson.name === "sigil-chat") return directory;
      } catch {
        // Keep walking; an unrelated malformed package file is not the root.
      }
    }
    const parent = dirname(directory);
    if (parent === directory) {
      throw new Error(
        `Could not find the Sigil Chat project root from ${resolve(startDirectory)}. Expected either package.json with name "sigil-chat" or fixtures/application/sigil-chat.yaml in an ancestor directory.`,
      );
    }
    directory = parent;
  }
}
