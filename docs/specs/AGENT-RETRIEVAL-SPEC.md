# Agent Retrieval and Grounding — provenance note

> Status: authority split executed 2026-07-17
> Historical mixed specification: git object
> `4cce235ce8716a691510f3469831c8c9817a4e4b:docs/specs/AGENT-RETRIEVAL-SPEC.md`

The former document mixed Gonk retrieval contracts with Sigil search,
attachment, and citation UX. It is no longer authoritative.

- Canonical source, index, query, authorization, citation, receipt, and context
  contribution semantics: Gonk Core `docs/retrieval-design.md` and
  `@gonk/retrieval`.
- Sigil search, result, citation, React Query, Eve, and host-adapter guidance:
  the sigil-agent repository's `docs/specs/RETRIEVAL-CONSUMER-PROFILE.md`.

Do not restore query, indexing, or authorization contracts here.
Product-specific implementation evidence belongs in the Sigil Chat execution
ledger.
