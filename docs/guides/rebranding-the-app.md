# Rebranding the application

Product identity is checked in as the Mirk fixture at
`fixtures/application/sigil-chat.yaml`:

```yaml
branding:
  name: Lantern
  title: Lantern — campaign room
  description: A collaborative campaign workspace.
  accent: "#5f78ff"
  shareImageUrl: /share/lantern.png
```

That one object drives authentication email copy, browser/share metadata, the
PWA manifest, theme color, and the procedural favicon. Rebranding no longer
requires copying seven environment variables into every shell and deployment.

`shareImageUrl` accepts an absolute URL or a root-relative path. Use a PNG/JPEG
image sized for link previews; the procedural favicon is an SVG data URL meant
for browser tabs, not social cards.

Set the deployment origin once with `SIGIL_PUBLIC_URL`. The same URL configures
Better Auth, trusted-origin defaults, Eve's token issuer, JWKS discovery, and
public metadata:

```dotenv
SIGIL_PUBLIC_URL=https://lantern.example
```

## Worktree identity

Development worktrees need no configuration. Portless gives all three services
one branch-derived namespace, and the browser title gains that label plus a
stable generated accent. For example, `feature/chrome` becomes
`[feature-chrome] Lantern — campaign room`.

To keep the normal product title in every development worktree, add
`instanceLabel: false` to the fixture's `branding` object. To pin a specific
label instead, set `instanceLabel` to a string.
