# Invite-demo Compose topology fixture

This directory is a secret-free, non-launchable topology fixture for
[`DEPLOYMENT-INVITE-DEMO-SPEC.md`](../../DEPLOYMENT-INVITE-DEMO-SPEC.md).
It is not a deployment kit. It intentionally uses `.invalid` for the public
host and local `:spec-only` image names.

The base file defines the one-public-origin topology and hardening contract.
These two overlays remain narrow credential-isolation fixtures, so select
exactly one when rendering them. They do not model the later owner-managed,
multi-provider runtime in
[`MODEL-ADMINISTRATION-AND-USAGE-SPEC.md`](../../MODEL-ADMINISTRATION-AND-USAGE-SPEC.md);
the production fixture must be revised before that runtime can claim its remote
deployment proof.

```bash
docker compose \
  --env-file .env.example \
  -f compose.yaml \
  -f compose.device-auth.yaml \
  config

docker compose \
  --env-file .env.example \
  -f compose.yaml \
  -f compose.api-auth.yaml \
  config
```

These commands only render configuration. Do not run `up`. The referenced
application images and `*_FILE`/readiness/startup contracts do not exist yet,
and the secret files are intentionally absent.

Run the static fixture check with:

```bash
node verify-static.mjs
```

The checker verifies both overlays, only `edge` publishes ports, the backend
network is internal, the exec posture is disabled, credentials mount only into
Eve, no container is privileged, and the fixture contains no public hostname or
literal secret value. It requires Docker Compose but creates nothing.

Real secret files, `CODEX_HOME`, provider state, hostnames, image digests, and
launch receipts belong in the disposable deployment environment, never here.
