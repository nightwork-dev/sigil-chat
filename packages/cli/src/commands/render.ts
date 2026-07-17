// sigil render <file> — render a .tsx report into a portable single-file HTML.
// Server-rendered HTML + inlined CSS + inlined local images + Open Graph tags +
// a JSON agent manifest. See docs/specs/template-cli-and-static-report-proposal.md §5.2.

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { getBool, getString, getStrings, type ParsedArgs } from "../lib/argv";
import type { ReportSkill } from "../report/define-report";
import { copyCompanionPreview, inspectPreview } from "../report/preview";
import { renderReport } from "../report/render";

export async function renderCommand(args: ParsedArgs): Promise<void> {
  const reportFile = args.positional[0];

  if (!reportFile) {
    process.stderr.write("sigil render: missing report file\n\n");
    process.stderr.write(
      "Usage: sigil render <report.tsx> [--out <file>] [--strict]\n",
    );
    process.exit(1);
  }

  const reportPath = resolve(reportFile);
  const outPath = resolve(
    getString(args.flags, "out") ?? defaultOutPath(reportPath),
  );
  const projectRoot = getString(args.flags, "cwd");
  const strict = getBool(args.flags, "strict");
  const inline = getBool(args.flags, "inline", true);
  const preview = resolveMaybe(getString(args.flags, "preview"));
  const companionPreview = resolveMaybe(
    getString(args.flags, "companionPreview"),
  );
  const agentSummary = readTextOrValue(getString(args.flags, "agentSummary"));
  const skills = getStrings(args.flags, "skill").map(readSkill);

  if (!existsSync(reportPath)) {
    process.stderr.write(`sigil render: report not found: ${reportPath}\n`);
    process.exit(1);
  }

  const outDir = dirname(outPath);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  process.stdout.write(`Rendering ${reportPath}...\n`);

  try {
    if (preview) {
      const info = inspectPreview(preview);
      const dimensions =
        info.width && info.height ? ` (${info.width}x${info.height})` : "";
      process.stdout.write(`  preview: ${info.mime}${dimensions}\n`);
    }
    if (companionPreview && !preview) {
      throw new Error("--companion-preview requires --preview <local-image>");
    }

    const result = await renderReport({
      reportPath,
      outPath,
      projectRoot,
      strict,
      inline,
      overrides: {
        title: getString(args.flags, "title"),
        summary: getString(args.flags, "summary"),
        preview,
        agentSummary,
        skills,
      },
      publicUrl: getString(args.flags, "publicUrl"),
      previewUrl: getString(args.flags, "previewUrl"),
    });

    for (const w of result.warnings) process.stdout.write(`  warning: ${w}\n`);

    if (strict && result.issues.length > 0) {
      process.stderr.write(
        `\nsigil render: strict check failed (${result.issues.length}):\n`,
      );
      for (const issue of result.issues) process.stderr.write(`  - ${issue}\n`);
      process.exit(1);
    }

    if (companionPreview && preview) {
      const companionDir = dirname(companionPreview);
      if (!existsSync(companionDir))
        mkdirSync(companionDir, { recursive: true });
      copyCompanionPreview(preview, companionPreview);
      process.stdout.write(`  Companion preview: ${companionPreview}\n`);
    }

    process.stdout.write(`\nRendered "${result.title}" → ${outPath}\n`);
    process.stdout.write(
      `  HTML: ${(result.htmlBytes / 1024).toFixed(1)} KB\n`,
    );
    process.stdout.write(`  CSS:  ${(result.cssBytes / 1024).toFixed(1)} KB\n`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`sigil render: ${msg}\n`);
    process.exit(1);
  }
}

function defaultOutPath(reportPath: string): string {
  return reportPath.replace(/\.tsx?$/, ".html");
}

/** Resolve a user-supplied path override to an absolute path (undefined passes through). */
function resolveMaybe(p: string | undefined): string | undefined {
  return p ? resolve(p) : undefined;
}

function readTextOrValue(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const path = resolve(value);
  return existsSync(path) ? readFileSync(path, "utf-8").trim() : value;
}

function readSkill(path: string): ReportSkill {
  const absolute = resolve(path);
  if (!existsSync(absolute))
    throw new Error(`Embedded skill file not found: ${absolute}`);
  const parsed = JSON.parse(readFileSync(absolute, "utf-8")) as ReportSkill;
  return parsed;
}
