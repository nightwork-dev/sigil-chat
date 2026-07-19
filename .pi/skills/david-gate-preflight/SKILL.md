---
name: david-gate-preflight
description: MANDATORY before requesting any browser:David review — the accumulated checklist of every issue David has flagged, run by a machine pass first so his attention only sees what machines cannot judge. Add every new David-flagged issue here the day it happens.
---

# David-gate preflight

David's attention is the program's scarcest resource. A `browser:David`
gate may only be REQUESTED after a preflight pass (Sonnet browser lane, or
the implementing agent against a real browser) has verified every item
below. Anything the preflight could have caught that reaches David anyway
is a process failure. **This list is append-only history: every issue
David flags in review gets added the same day.**

## The accumulated checklist (2026-07-18 origin)

Viewport ~375px iPhone, hard-refreshed, over the tailnet preview:

- [ ] No double scroll: the page does not scroll; scroll lives in
      contained regions only (height chain intact root → main → surface).
- [ ] Main section fills the viewport; no dead void under short content.
- [ ] No input triggers focus zoom (≥16px effective font / clamp policy
      per S5.3's reconciliation).
- [ ] Focus/hover rings never clipped by scroll containers.
- [ ] Scrollbars never sit flush against content (gutter + padding).
- [ ] Horizontal scrollers have deliberate sizing/snap; neighbors peek
      intentionally, never clip as unreadable slivers.
- [ ] iOS safe-area respected (title never under the status bar).
- [ ] Tap targets ≥44px; no hover-only affordances.
- [ ] The feature has a discoverable route/surface (not chat-only) AND its
      selection state demonstrably reaches agent context (A/B grounding
      check per the surface-first principle).
- [ ] Console clean; no hydration errors.

## Protocol

1. Implementing lane finishes → runs or dispatches the preflight.
2. Preflight failures → fix before David ever sees the story.
3. Preflight passes → THEN move the story to `verify` and notify David,
   stating "preflight passed" in the story comment.
4. David flags something new anyway → it joins this checklist the same
   day, with the story reference.

## Wall-of-shame checks (mechanical — added 2026-07-18, images in
## sigil-design's ux-design-language/wall-of-shame/)

- [ ] **No triple label**: the content region renders NO heading/eyebrow/
      title whose text repeats the breadcrumb or nav label for this route
      (grep the route's feature for SectionHeader/h1 text vs its nav
      entry — a literal string match is an automatic fail).
- [ ] **No permanent explainer**: no Alert/banner that describes what the
      screen is or how its actions behave, rendered unconditionally.
      Behavior notes live in the moment (dialogs, tooltips).
- [ ] **Empty states are action surfaces**: every empty state in the diff
      contains at least one direct action and zero instructions to visit
      another surface.
- [ ] **Every new form field/constraint** names the failure it prevents
      in this product (one line in the story), or it is removed.
