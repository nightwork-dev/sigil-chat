# Sigil CLI Improvements Task List

> Branch: `codex/sigil-cli-improvements`
> Baseline: `main` / local `dev` at `7e94fd1`
> Scope: close the actionable gaps in `template-cli-and-static-report-proposal.md`
> while preserving the newer always-hydrated report contract.

## P0 — Product contract

- [x] Complete `sigil create`: package-manager selection, install opt-out,
      optional Git initialization, verification, force behavior, and correct `--cwd`
      semantics.
- [x] Execute or deliberately replace manifest `postCreate` behavior so declared
      scaffold actions are not silently ignored.
- [x] Add a publishable `create-sigil` entrypoint and package-ready build/export
      shape without publishing from this branch.
- [x] Preserve the always-hydrated report behavior and update stale documentation
      that still describes static-only output.

## P0 — Agent-readable reports

- [x] Preserve `agent.summary` in the embedded manifest.
- [x] Add typed, advisory, report-scoped embedded skills with explicit trust and
      precedence language.
- [x] Validate embedded skills and navigation IDs/selectors.
- [x] Add report and template JSON Schemas plus schema-focused tests.
- [x] Add useful source provenance such as Git commit and content digest.

## P1 — Preview and distribution

- [x] Validate explicit preview type and dimensions when the format exposes them.
- [x] Support a companion preview output derived from an explicit local preview.
- [ ] Add generated 1200x630 preview support when it can reuse an available
      browser runtime without adding an unapproved dependency.
- [ ] Keep hosted Open Graph preview behavior distinct from local artifact and
      companion-file behavior.

## P1 — Validation and assets

- [ ] Extend local asset handling beyond plain `<img src>` where the renderer can
      do so safely (`srcset`, `<source>`, posters, and related local references).
- [x] Strengthen strict validation for manifest structure, navigation targets,
      duplicate IDs, preview metadata, and runtime/offline assumptions.
- [x] Add focused unit tests, CLI tests, and a generated-project smoke test.

## P2 — Follow-on work

- [ ] Evaluate MDX input after the TSX and package contracts are stable.
- [ ] Keep image-capsule transport experimental and separate from normal report
      generation.
- [ ] Explore manifest signing only after the unsigned schema and provenance
      contract are stable.

## Completion checks

- [x] `pnpm --filter sigil test`
- [x] `pnpm --filter sigil typecheck`
- [x] `pnpm --filter sigil build`
- [x] Scaffold a temporary project, install it, build it, and run all workspace
      typechecks.
- [x] Render the sample report and inspect the embedded manifest.
- [ ] Open the report offline, exercise interactivity, confirm a clean console,
      and confirm zero network requests. The generated HTML was statically confirmed
      to contain one inline module and no external `src`/`href`; direct `file:`
      navigation was blocked by the app browser's URL policy.
