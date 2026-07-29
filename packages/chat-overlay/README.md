# Sigil Chat overlay

This package is the Chat-owned delta for the Sigil Design scaffold. It adds the
Eve and Gonk applications, neutral agent contracts, Chat routes and components,
store adapters, and the shared runtime topology contract.

Generate a local project from this source overlay while developing it:

```sh
pnpm --filter @sigil-design/chat-overlay stage
sigil create my-chat --profile chat --overlay ./packages/chat-overlay
```

The distributable handoff is a registry item, not an npm package:

```sh
pnpm --filter @sigil-design/chat-overlay registry:item
```

That writes `dist/chat-overlay.registry.json`, whose contents can be hosted
verbatim as `apps/web/public/r/chat-overlay.json` in the Sigil Design registry.
The emitted item uses the Sigil CLI registry-overlay contract:

- top-level fields: `$schema`, `name`, `version`, `digest`, `overlay`, `files`
- `digest`: `sha256-` plus base64url SHA-256 over stable
  `{ name, version, overlay, files }`
- `files[]`: `{ path, content, encoding }`, with `content` base64-encoded here

`files/` and `dist/` are generated from an explicit allowlist. They are not a
second checked-in scaffold; the current Sigil Chat source remains authoritative.
