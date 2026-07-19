import { spawn } from "node:child_process";

const env = {
  ...process.env,
  GONK_MCP_KEY: process.env.GONK_MCP_KEY ?? "fixture-local-key",
};
const children = ["pnpm agent", "pnpm gonk"].map((command) =>
  spawn(command, { shell: true, stdio: "inherit", env }),
);
const stop = () => children.forEach((child) => child.kill("SIGTERM"));
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
