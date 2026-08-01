# Configuration without the scavenger hunt

Sigil Chat has three configuration layers:

1. `pnpm dev` needs no environment file. It derives worktree URLs and creates
   disposable data, an agent binding secret, migrations, and the development owner.
2. `fixtures/application/sigil-chat.yaml` is a typed Mirk fixture for checked-in
   product behavior: branding, the fresh-install bootstrap model, registration
   policy, and image quality/preset.
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

### Portable compute through Gonk Fabric

Sigil Chat can dispatch the canonical `image_generate@1` capability to an
enrolled llm-service worker without importing Fabric into the product or the
browser. The optional integration lives in the server-only Eve host adapter.
When `GONK_FABRIC_RELAY_URL` is absent, the adapter is not created and the
portable image capability is not registered.

For loopback development, create the dispatcher, worker, and relay enrollment
bundle in one command:

```bash
pnpm --package @gonk/fabric@0.3.7 dlx \
  gonk-fabric-bootstrap .data/fabric-local
```

The command refuses to overwrite its target and writes private material with
owner-only permissions. Source `.data/fabric-local/sigil-chat.env` into the
agent process, use `relay-config.json` for the Gonk relay, and source
`compute-worker.env` in llm-service. The generated `ws://` endpoint and
insecure flags work only on loopback; deployments use `wss://` and mounted TLS
material.

The Eve host needs:

| Variable | Purpose |
| --- | --- |
| `GONK_FABRIC_RELAY_URL` | Encrypted relay endpoint; setting it enables the adapter |
| `GONK_FABRIC_STATE_DIR` | Durable replay state, normally below `SIGIL_DATA_DIR` |
| `GONK_FABRIC_DISPATCHER_IDENTITY_FILE` | Dispatcher signing/encryption private identity |
| `GONK_FABRIC_DISPATCHER_CERTIFICATE_FILE` | Authority-signed dispatcher certificate |
| `GONK_FABRIC_WORKER_CERTIFICATE_FILE` | Exact enrolled image worker certificate |
| `GONK_FABRIC_AUTHORITY_PRIVATE_KEY_FILE` | Grant-signing authority private key |
| `GONK_FABRIC_AUTHORITY_KEY_ID` | Key id named by both endpoint certificates |
| `GONK_FABRIC_RESTRICTION_POLICY_REFS` | Signed worker restriction refs, default `private-local` |
| `GONK_FABRIC_IMAGE_PROVIDER` | Allowed provider, default `comfyui` |
| `GONK_FABRIC_IMAGE_MODEL_ID` | Allowed model, default `local/chroma` |

Each tool call reuses the authenticated principal, immutable Eve session
binding, resource scope, turn id, and application thread to derive its
execution and state-partition bindings. The request grants only one declared
image output slot, bounded runtime/events/bytes, the exact provider/model, and
the `private-local` worker policy. The relay sees only authenticated encrypted
envelopes; Gonk remains the job, lease, cancellation, authorization, and
terminal-commit authority.

The llm-service worker can also host the Codex OAuth image provider used by
Sigil Game's Novelty character studio. That path is locally invoked but sends
the prompt to OpenAI; it is not local inference. Using it through Fabric
requires all three explicit settings:

```dotenv
GONK_FABRIC_RESTRICTION_POLICY_REFS=cloud-openai
GONK_FABRIC_IMAGE_PROVIDER=codex
GONK_FABRIC_IMAGE_MODEL_ID=gpt-5.6-terra
```

The worker rejects `private-local` grants when its selected backend is Codex.

Keep `GONK_FABRIC_STATE_DIR` under `SIGIL_DATA_DIR` in development if
`pnpm dev:reset` should quarantine it with the rest of disposable application
state. The generated `.data/fabric-local` bundle contains credentials and is
not itself reset or committed; delete and re-enroll it deliberately when
rotating the local authority. Existing application threads and session-owner
bindings are governed by their own store/reset contract, not by the relay.

Its `preset` and `quality` live in the Mirk fixture. `agent.model` selects the
Eve turn model. The old bare string form still works and maps to
`provider: codex`:

```yaml
agent:
  model: gpt-5.6-terra
```

Structured model configuration names the provider and model explicitly:

```yaml
agent:
  model:
    provider: openai-compatible
    model: llama3.1:8b
    baseUrl: http://127.0.0.1:11434/v1
    contextWindowTokens: 131072
```

For hosted providers, keep secrets out of the fixture. Either rely on the
default `SIGIL_MODEL_<PROVIDER>_API_KEY` name or set `apiKeyEnv` to the exact
environment variable Eve should require before startup. Hosted providers are
constructed as direct AI SDK provider instances; AI Gateway is not used by this
contract unless a future fixture provider models it explicitly.

```yaml
agent:
  model:
    provider: openrouter
    model: anthropic/claude-sonnet-4.6
    apiKeyEnv: SIGIL_MODEL_OPENROUTER_API_KEY
```

Changing the fixture does not silently rewrite existing owner-managed model
profiles or thread bindings once those exist. Provider endpoints, credentials,
and usage are installation state governed by
[`MODEL-ADMINISTRATION-AND-USAGE-SPEC.md`](../specs/MODEL-ADMINISTRATION-AND-USAGE-SPEC.md).

### Model providers

`agent.model` names the one model Eve resolves at startup. `agent.providers`
names everything else the deployment can run. A provider states its transport
kind, endpoint, and credential **once** and fans out the models it offers, so a
hosted OpenAI-compatible vendor is data rather than a code branch:

```yaml
agent:
  model: gpt-5.6-terra
  providers:
    - id: codex
      label: Codex subscription
      kind: codex
      models:
        - id: luna
          model: gpt-5.6-luna
          label: GPT-5.6 Luna

    - id: deepseek
      label: DeepSeek
      kind: openai-compatible
      baseUrl: https://api.deepseek.com/v1
      apiKeyEnv: SIGIL_MODEL_DEEPSEEK_API_KEY
      contextWindowTokens: 65536
      models:
        - id: chat
          model: deepseek-chat
        - id: reasoner
          model: deepseek-reasoner
          contextWindowTokens: 131072
```

Each provider needs a unique lowercase-slug `id`, a `label`, a supported
`kind`, and at least one model; each model needs a slug `id` unique within its
provider and a `model`. `baseUrl` is required for `openai-compatible`.
Provider-level `contextWindowTokens` applies to every model beneath it and a
model may override its own. The provider id `deployment` is reserved for the
entry synthesized from `agent.model`, so the inventory is never empty and the
running model is always identifiable. A malformed or duplicated entry fails
fixture validation before startup.

Never put a key in a provider. `apiKeyEnv` names the environment variable Eve
reads it from.

#### Model ids and session bindings

A model's selectable id is **`<providerId>/<modelId>`** — for example
`deepseek/chat`. That id is what a session's immutable execution binding
records, so **renaming either slug retires the old id**. Sessions bound to a
retired id fall back to the deployment default and log a warning naming the
unresolved id; they never fail, and they never fall back silently. Treat these
slugs as stable identifiers, not display strings — `label` is what you change
when you want different wording.

#### Shaped but not yet enforced

Two fields are accepted, validated, and normalized, but nothing consumes them:

- `enabled` on a provider and on a model. A model inside a disabled provider
  normalizes to disabled regardless of its own flag — the provider holds the
  credential. This is the allow-list slot; selection does not yet honour it.
- `capability` on a model: `chat` (default), `embedding`, or `voice`.

They are shaped now so the allow-list and embedding work land without another
schema change.

### Settings → Models

The owner-only **Models** section of `/settings` lists providers with their
kind, endpoint, and credential status, models nested beneath each, and probes a
local OpenAI-compatible endpoint before you commit to it.

- **Credential status is presence only.** Eve answers the settings surface
  with booleans and variable NAMES; a credential value never leaves the agent
  process.
- **Probing** asks `{baseUrl}/models` (or `{baseUrl}/v1/models` when the base
  URL has no version segment) and reports reachability plus the served model
  list.
- **A probe request carries a URL and nothing else.** Which credential — if
  any — Eve attaches is decided from `agent.providers` by matching the probed
  **origin**. A provider for `https://api.deepseek.com/v1` lends its credential
  to that origin and to no other, and an origin with no matching provider is
  probed unauthenticated (the ordinary local-server case). The caller cannot
  name a variable, so it cannot aim a configured key at a host it chose.
- **Both** model-endpoint routes require the verified `owner` role in the web
  app *and* the shared `SIGIL_AGENT_BINDING_SECRET` on the internal call. The
  owner role is a web-app concept Eve cannot verify on its own; the secret is
  how the web server asserts it already checked. Without it configured, both
  routes refuse.
- **Adding a provider** means adding a fixture entry: after a successful probe
  the section generates the YAML to paste under `agent.providers`. Eve reads
  the fixture at startup, so restart the agent runtime afterwards.

Selecting a model in this section binds it to the sessions you start next. It
is fixed for the life of a conversation, so chats already open keep the model
they began with.

#### Probe target policy — deployment note

The probe refuses base URLs carrying a query string, fragment, or embedded
credentials, builds the catalog path on a parsed URL object, and does not
follow redirects. It denies link-local and cloud-metadata targets —
`169.254.0.0/16` in dotted, integer, and IPv4-mapped-IPv6 spellings,
`fe80::/10`, `fd00::/8`, and the Google metadata hostnames.

**Loopback and RFC1918 stay allowed**, deliberately: reaching a model server
on `127.0.0.1` or `192.168.1.50` is the point of the feature. Two consequences
worth knowing before you deploy:

- An owner can make the Eve process issue a GET to any private address it can
  route to, and learn whether that address answers. If Eve runs somewhere with
  network reach you would not grant its owner, that reach is the boundary to
  fix — not this feature.
- `fd00::/8` is denied even though it is the IPv6 analogue of RFC1918, because
  that block carries AWS's IPv6 metadata address. An IPv6-ULA model server
  therefore cannot be probed; use its IPv4 address or a hostname.

This is a structural fence, not a full SSRF boundary: a hostname that resolves
to a denied address at DNS time is not caught, and cannot be without resolving
first and pinning the socket. The owner gate plus the binding secret are the
actual control.

Selecting a preferred model in this section records the choice for your
account. Sessions do not yet carry a model of their own — the execution
binding has no model field — so every session runs the entry marked Active
until per-session model binding lands.

Two integration smokes cover the model paths:

```bash
pnpm --filter sigil-chat-agent test:openai-compatible-smoke
pnpm --filter sigil-chat-agent test:hosted-provider-smoke
```

The OpenAI-compatible smoke starts a local fake `/v1/chat/completions` server,
boots Eve, sends a real signed `/eve/v1/session` message, consumes the Eve
stream, and requires a native todo tool request, a completed tool result, final
model text, and `turn.completed`. The hosted smoke applies the same stream
criteria against a live hosted provider when credentials are present; it reports
a clean skip when the configured `SIGIL_MODEL_*_API_KEY` is absent.

These smokes exercise the strongest local boundary without running the full web
app: they use the same signed Eve binding header that the authenticated web
session attaches in `apps/web/src/components/agent-sessions.test.ts`. They do
not themselves prove a browser/same-origin web server initiation.

Eve honors standard `CODEX_HOME` when it is set and otherwise uses
`~/.codex`. Local development therefore reuses the operator's existing Codex
login by default. Remote deployments may set `CODEX_HOME` to a dedicated
persistent Eve-only volume so the owner can manage ChatGPT device login or an
OpenAI API-key login remotely. There is no Sigil-specific Codex-home variable.

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
