---
name: owner-verification-queue
description: Author the in-app owner verification checklist whenever a roadmap story reaches `verify` — the queue overlay is the owner's review surface of record.
---

# Owner verification queue

The verification queue overlay (VQ.1, mounted behind the `dev.verificationQueue`
flag in Sigil Chat and Sigil Game) lists every roadmap story at
`status: verify`, newest first. Each row shows the story, its authored
checklist, and a "take me there" deep link. When the owner checks a story off
in the app, the app appends the pass comment and transitions the story —
that transition belongs to the owner's click, not to an agent edit.

The queue is the owner's review surface of record. A story that reaches
`verify` without an authored checklist appears as a bare row with a fallback
link to its own roadmap panel — reviewable, but it spends the owner's
attention reconstructing what to check. Author the checklist in the same beat
that moves the story to `verify`.

## Authoring the `verify` block

Add to the story's YAML frontmatter (any position; convention is after
`deps`):

```yaml
verify:
  url: /characters
  steps:
    - Open /characters and confirm it resumes the persistent draft rather
      than starting a fresh chat.
    - Make one direct edit and accept one agent proposal; confirm both land
      in the same revision history without conflict.
```

- `url` — a same-origin in-app path (`/route?params` form). It is sanitized
  through the login `returnTo` guard; an off-origin or absent url falls back
  to `/roadmap?story=<id>`. Point it at the surface where step 1 begins.
  Omit it for stories verified outside the app (terminal evidence, review
  acceptance) — the fallback panel is correct there.
- `steps` — 2–6 imperative steps a reviewer with **no session context** can
  run. Each step names a concrete action on a named surface and the
  observable result that counts as a pass ("expect exactly one agent
  continuation and no revision error"), never an internal claim to take on
  faith ("confirm the batching works").

## When a checklist is required

- `reviewGate: browser:owner` — always. The review-gate-preflight protocol's
  "move to `verify`" step includes authoring this block; a browser:owner
  story at `verify` without `verify.steps` fails the roadmap integrity check.
- Peer-gated stories whose remaining gate is an owner ruling (accepting a
  review, confirming release evidence) — author steps that state what is
  being ruled on and what acceptance advances.

## Validation

From the roadmap store root:

```
python3 scripts/check-story-integrity.py --strict
```

validates verify blocks (frontmatter parses, steps are a non-empty string
list, url is a same-origin path) alongside the path-integrity rules, and
runs automatically from the roadmap repository's tracked pre-commit hook.
