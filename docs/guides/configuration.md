# Configuration without the scavenger hunt

Sigil Chat has three configuration layers:

1. `pnpm dev` needs no environment file. It derives worktree URLs and creates
   disposable data, an agent binding secret, migrations, and the development owner.
2. `fixtures/application/sigil-chat.yaml` is a typed Mirk fixture for checked-in
   product behavior: branding, model choice, registration policy, and image
   quality/preset.
3. Environment variables are reserved for deployment identity, secrets,
   external services, and unusual topology.

## Standard production surface

Most installations need six values:

| Variable                         | Purpose                                                       |
| -------------------------------- | ------------------------------------------------------------- |
| `SIGIL_PUBLIC_URL`               | One public origin for auth identity and metadata              |
| `SIGIL_DATA_DIR`                 | Default root for database and application stores              |
| `BETTER_AUTH_SECRET`             | Stable human-auth signing secret (32+ characters)             |
| `SIGIL_AGENT_BINDING_SECRET`     | Stable web/agent secret for signed session and scope bindings |
| `SIGIL_INSTALLATION_ID`          | Stable non-secret deployment identifier                       |
| `SIGIL_INVITE_TOKEN_PEPPER_FILE` | Mounted secret used to digest invitation tokens               |

The production Compose file uses secret files where appropriate. Set
`SIGIL_DATABASE_URL` only for a database outside `SIGIL_DATA_DIR`. Set
`EVE_ORIGIN` only when the two services do not use the standard network
topology. Eve derives JWKS discovery from `SIGIL_PUBLIC_URL`; set
`SIGIL_EVE_AUTH_JWKS_URL` only when it should fetch those same public keys over
an internal service address such as `http://web:3000/api/auth/jwks`. This does
not change the public JWT issuer.

## Optional authentication integrations

These are additive. A provider is enabled only when its whole credential group
is present; partial groups fail at startup.

```dotenv
RESEND_API_KEY=re_...
SIGIL_AUTH_EMAIL_FROM=Sigil Chat <signin@example.com>

SIGIL_AUTH_GOOGLE_CLIENT_ID=
SIGIL_AUTH_GOOGLE_CLIENT_SECRET=

SIGIL_AUTH_OKTA_CLIENT_ID=
SIGIL_AUTH_OKTA_CLIENT_SECRET=
SIGIL_AUTH_OKTA_ISSUER=https://example.okta.com/oauth2/default

SIGIL_AUTH_GITHUB_CLIENT_ID=
SIGIL_AUTH_GITHUB_CLIENT_SECRET=

SIGIL_AUTH_DISCORD_CLIENT_ID=
SIGIL_AUTH_DISCORD_CLIENT_SECRET=
```

Use `SIGIL_AUTH_TRUSTED_ORIGINS` only to add comma-separated exact origins
beyond `SIGIL_PUBLIC_URL`. Registration policy is the fixture's
`auth.registration` value (`closed` or `open`), so it is reviewed with code.

## Optional external services

Semantic recall remains lexical-only unless both endpoint and model are set:

```dotenv
SIGIL_EMBEDDING_BASE_URL=http://localhost:1234/v1
SIGIL_EMBEDDING_MODEL=nomic-embed-text-v1.5
SIGIL_EMBEDDING_DIM=768
SIGIL_EMBEDDING_API_KEY=
```

Image instruction-editing defaults to the local gateway on port 4000:

```dotenv
SIGIL_IMAGE_EDIT_GATEWAY_URL=http://localhost:4000
SIGIL_IMAGE_EDIT_GATEWAY_KEY=
SIGIL_IMAGE_EDIT_DOWNLOAD_ORIGINS=https://assets.example
```

Its `preset` and `quality` live in the Mirk fixture. The agent's Codex model is
also `agent.model` there; changing either is product behavior, not a secret or
machine-local deployment address.

Only the `SIGIL_IMAGE_EDIT_*` names are supported; the former generic gateway
aliases were removed so unrelated service credentials cannot be picked up by
accident.

## Isolated storage mounts

`SIGIL_DATA_DIR` supplies the normal layout, including the shared
`skills/` substrate used by both web management and Eve's request-bound Gonk
skill resolution. The AWS deployment deliberately keeps identity, blackboard,
roadmap, and container-registry volumes isolated,
so it uses the narrower `SIGIL_PERSONA_DIR`, `SIGIL_MEMORY_DIR`,
`SIGIL_BLACKBOARD_DIR`, `SIGIL_ROADMAP_DIR`, and
`SIGIL_CONTAINER_REGISTRY_ROOT` overrides at those service boundaries. These
are deployment internals, not fresh-worktree setup requirements.
