// sigil report check <file> — validate report metadata + resources WITHOUT
// writing output. Runs the same render internals (reusing the Vite build) and
// applies the strict validations. Exit 0 on PASS, 1 on any issue.
// See docs/specs/template-cli-and-static-report-proposal.md §5.1.

import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { getString, type ParsedArgs } from "../lib/argv"
import { renderReport } from "../report/render"

export async function reportCommand(args: ParsedArgs): Promise<void> {
  const sub = args.positional[0]

  if (sub !== "check") {
    process.stderr.write(`sigil report: unknown subcommand "${sub ?? ""}"\n\n`)
    process.stderr.write("Usage: sigil report check <report.tsx>\n")
    process.exit(1)
  }

  const reportFile = args.positional[1]
  if (!reportFile) {
    process.stderr.write("sigil report check: missing report file\n\n")
    process.stderr.write("Usage: sigil report check <report.tsx>\n")
    process.exit(1)
  }

  const reportPath = resolve(reportFile)
  const projectRoot = getString(args.flags, "cwd") ?? process.cwd()

  if (!existsSync(reportPath)) {
    process.stderr.write(`sigil report check: report not found: ${reportPath}\n`)
    process.exit(1)
  }

  process.stdout.write(`Checking ${reportPath}...\n`)

  try {
    const result = await renderReport({ reportPath, projectRoot, checkOnly: true })

    for (const w of result.warnings) process.stdout.write(`  warning: ${w}\n`)

    if (result.issues.length > 0) {
      process.stderr.write(`\nFAIL — ${result.issues.length} issue(s):\n`)
      for (const issue of result.issues) process.stderr.write(`  - ${issue}\n`)
      process.exit(1)
    }

    process.stdout.write(`\nPASS — "${result.title}" has no metadata or resource issues.\n`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    process.stderr.write(`sigil report check: ${msg}\n`)
    process.exit(1)
  }
}
