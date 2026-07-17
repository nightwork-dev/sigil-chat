# Sigil Chat overlay

This package is the Chat-owned delta for the Sigil Design scaffold. It adds the
Eve and Gonk applications, neutral agent contracts, Chat routes and components,
store adapters, and the shared runtime topology contract.

Generate a project with the Sigil CLI:

```sh
sigil create my-chat --profile chat --overlay @sigil-design/chat-overlay
```

`files/` is generated during `prepack` from an explicit allowlist. It is not a
second checked-in scaffold; the current Sigil Chat source remains authoritative.
