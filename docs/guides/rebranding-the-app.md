# Rebranding the application

Sigil Chat's public identity is resolved once when Vite starts. You can rename
the product, set its browser/share metadata, and recolor its favicon without
editing source files.

```dotenv
SIGIL_APP_NAME=Lantern
SIGIL_APP_TITLE=Lantern — campaign room
SIGIL_APP_DESCRIPTION=A collaborative campaign workspace.
SIGIL_APP_ORIGIN=https://lantern.example
SIGIL_BRAND_COLOR=#5f78ff
SIGIL_SHARE_IMAGE_URL=/share/lantern.png
```

`SIGIL_APP_NAME` is used in app chrome and authentication screens.
`SIGIL_APP_TITLE` becomes the browser and share-card title. The description,
canonical URL, Open Graph fields, Twitter card fields, PWA manifest, theme
color, and share image all resolve from the same configuration.

## Worktree identity

Development worktrees need no configuration. The dev scripts use Portless's
worktree-aware `run` mode, so a branch such as `feature/chrome` receives one
shared safe prefix across the web, Eve, and Gonk services. The browser title
becomes `[feature-chrome] Sigil Chat — agentic conversations` and gets a
deterministic accent-colored SVG favicon. The same prefix always receives the
same color. `PORTLESS_URL` also becomes the canonical/share origin, and the
runtime derives the sibling Eve/Gonk URLs from the same namespace.

Override the automatic identity when useful:

```dotenv
SIGIL_INSTANCE_LABEL=review
SIGIL_BRAND_COLOR=#e85d75
```

Set `SIGIL_INSTANCE_LABEL=` explicitly to keep the normal product title and
favicon while developing in a worktree. Production builds do not infer a
worktree label; only explicit branding is carried into them.

`SIGIL_SHARE_IMAGE_URL` accepts an absolute URL or a root-relative path. Use a
PNG/JPEG image sized for link previews; the procedural favicon is an SVG data
URL intended for browser tabs, not social-card crawlers.
