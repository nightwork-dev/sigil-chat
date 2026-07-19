# Agent Context Management — provenance note

> Status: authority split executed 2026-07-17
> Historical mixed specification: git object
> `4cce235ce8716a691510f3469831c8c9817a4e4b:docs/specs/AGENT-CONTEXT-MANAGEMENT-SPEC.md`

The former document mixed Gonk context contracts with Sigil consumer UX. It is
no longer authoritative.

- Canonical compiler, candidate, policy, budget, authorization, and receipt
  semantics: Gonk Core `docs/context-design.md` and `@gonk/context`.
- Sigil tray, privacy, retention, preview, React Query, and host-adapter
  guidance:
  the sigil-agent repository's `docs/specs/CONTEXT-CONSUMER-PROFILE.md`.

Do not restore contract interfaces or compiler behavior here. Product-specific
implementation evidence belongs in the Sigil Chat execution ledger.
