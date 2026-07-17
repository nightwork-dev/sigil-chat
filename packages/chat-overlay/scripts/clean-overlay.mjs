import { rmSync } from "node:fs";
import { filesRoot } from "./stage-overlay.mjs";

rmSync(filesRoot, { recursive: true, force: true });
