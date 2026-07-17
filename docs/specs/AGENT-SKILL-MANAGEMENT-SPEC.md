# Agent Skill Management — provenance note

> Status: authority split executed 2026-07-17
> Historical mixed specification: git object
> `4cce235ce8716a691510f3469831c8c9817a4e4b:docs/specs/AGENT-SKILL-MANAGEMENT-SPEC.md`

The former document mixed Gonk managed-skill contracts with Sigil catalog and
review UX. It is no longer authoritative.

- Canonical managed records, scope, lifecycle, activation, authorization, and
  receipt semantics: Gonk Core `docs/skills-design.md` and `@gonk/skills`.
- Cross-repository disposition and shipped anchors:
  the Gonk Core repository's `docs.local/specs/SIGIL-GONK-CONTRACT-DISPOSITION-20260716.md`.
- Sigil catalog, detail, review, React Query, and host-adapter guidance:
  the sigil-agent repository's `docs/specs/SKILLS-CONSUMER-PROFILE.md`.

Do not restore registry or lifecycle contracts here. Product-specific
implementation evidence belongs in the Sigil Chat execution ledger.
