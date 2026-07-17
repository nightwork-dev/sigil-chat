#!/usr/bin/env node
// sigil — the Sigil CLI. Scaffold apps and render portable reports.
//
// Foundation vertebra: argv routing for help / version / commands.
// See the proposal spec:
//   docs/specs/template-cli-and-static-report-proposal.md

import { parseArgs } from "../lib/argv";
import { createCommand } from "../commands/create";
import { renderCommand } from "../commands/render";
import { reportCommand } from "../commands/report-check";

declare const __SIGIL_VERSION__: string;

const NAME = "sigil";

export const HELP = `Usage
  $ ${NAME} <command> [options]

Commands
  create <name>         Scaffold a new app from the Sigil template.
  render <file>         Render a .tsx report into a portable single-file HTML artifact.
  report check <file>   Validate report metadata + resources without writing output.

Render options
  --out <file>          Output HTML path (default: report path with .html).
  --cwd <path>          Source/provenance root (default: nearest report project).
  --title <text>        Override the report title.
  --summary <text>      Override the report summary.
  --preview <path>      Local preview image path (metadata).
  --companion-preview <path>
                        Copy --preview to a companion distribution artifact.
  --agent-summary <text-or-file>
                        Override the agent-facing report summary.
  --skill <json-file>   Embed an advisory report-reader skill; repeatable.
  --public-url <url>    Canonical URL for og:url.
  --preview-url <url>   Fetchable preview image URL for og:image.
  --strict              Fail on external resources, missing metadata, or oversize output.
  --inline/--no-inline  Inline local images as data URLs (default: inline).

Global options
  -h, --help            Print this help.
  -v, --version         Print the ${NAME} version.

Examples
  ${NAME} create my-app
  ${NAME} render ./reports/weekly.tsx --out ./dist/weekly.html
  ${NAME} render ./reports/incident.tsx --preview-url https://cdn/incident.png --strict
  ${NAME} report check ./reports/weekly.tsx

Reference
  docs/specs/template-cli-and-static-report-proposal.md
`;

const COMMAND_HELP: Record<string, string> = {
  create: `Usage
  $ sigil create <name> [options]

Options
  --cwd <path>          Destination root (default: current directory).
  --package-manager <pnpm|npm|yarn|bun>
                        Package manager (default: template preference).
  --install/--no-install
                        Install dependencies (default: install).
  --git/--no-git        Initialize Git (default: initialize).
  --verify              Build and typecheck the generated project.
  --force               Replace an existing target directory.
  --dry-run             Show the scaffold plan without writing files.
  -h, --help            Print this help.
`,
  render: `Usage
  $ sigil render <report.tsx> [options]

Options
  --out <file>          Output HTML path (default: report path with .html).
  --cwd <path>          Source/provenance root (default: nearest report project).
  --title <text>        Override the report title.
  --summary <text>      Override the report summary.
  --preview <path>      Local preview image path.
  --companion-preview <path>
                        Copy --preview to a companion artifact.
  --agent-summary <text-or-file>
                        Override the agent-facing report summary.
  --skill <json-file>   Embed an advisory skill; repeatable.
  --public-url <url>    Canonical URL for og:url.
  --preview-url <url>   Fetchable preview image URL for og:image.
  --strict              Fail validation on warnings.
  --inline/--no-inline  Inline local images (default: inline).
  -h, --help            Print this help.
`,
  report: `Usage
  $ sigil report check <report.tsx> [options]

Options
  --cwd <path>          Source/provenance root (default: nearest report project).
  --strict              Fail validation on warnings.
  -h, --help            Print this help.
`,
};

export async function runCli(args: string[]): Promise<number> {
  const first = args[0];

  if (
    first === undefined ||
    first === "-h" ||
    first === "--help" ||
    first === "help"
  ) {
    process.stdout.write(HELP);
    return 0;
  }

  if (first === "-v" || first === "--version" || first === "version") {
    process.stdout.write(`${NAME} v${__SIGIL_VERSION__}\n`);
    return 0;
  }

  if (
    COMMAND_HELP[first] &&
    args.slice(1).some((arg) => arg === "-h" || arg === "--help")
  ) {
    process.stdout.write(COMMAND_HELP[first]);
    return 0;
  }

  if (first === "create") {
    await createCommand(parseArgs(args.slice(1)));
    return 0;
  }

  if (first === "render") {
    await renderCommand(parseArgs(args.slice(1)));
    return 0;
  }

  if (first === "report") {
    await reportCommand(parseArgs(args.slice(1)));
    return 0;
  }

  process.stderr.write(`${NAME}: unknown command "${first}"\n\n`);
  process.stderr.write(HELP);
  return 1;
}

if (process.env.SIGIL_EMBEDDED_ENTRYPOINT !== "1") {
  runCli(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    });
}
