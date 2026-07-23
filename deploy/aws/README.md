# AWS single-host deployment

This is the executable shape for DEP.2: one disposable Ubuntu EC2 host, one
Elastic IP, a security group allowing only TCP 80/443, and this Compose project.
Caddy is the only public listener. Web, Eve, and all data volumes are on
the private Compose network and have no published ports.

## Resource plan

The root Terraform module in [`terraform/`](terraform/) owns one `t3.medium`
Ubuntu 24.04 EC2 instance with a 40 GiB encrypted gp3 root volume, an Elastic
IP, security group, and key pair. It has local state, no workspaces, no module
registry, and no remote backend. SSH is limited to one explicit administrator
CIDR; app traffic is limited to HTTP/HTTPS. Route53 is optional; omitted means
DNS stays under the owner's existing provider control. Set a small AWS Budget
alarm before provisioning. This is deliberately a single-host demo, not a
high-availability design.

The DNS A record for the chosen public hostname must point to the Elastic IP
before Caddy starts. Caddy obtains and renews TLS certificates; only its
`/data` and `/config` state live in `/srv/sigil-chat` on the host.

## Existing pre-cutover installations

The normal updater accepts only the current three-image, Web + Eve topology.
If the host still has a Compose `gonk` service/container or Gonk image/key/URL
settings, it exits before copying manifests, pruning images, or stopping
services. Follow
[One-time migration from the Gonk service](MIGRATING-FROM-GONK-SERVICE.md)
first.

That procedure is intentionally manual and removable. The application does not
copy or merge legacy data, remove orphan containers, or retain a compatibility
service. Back up the old volume before the cutover. The guide also provisions
the new Web/Eve binding secret before the updater can mutate the deployment and
defers emptying the obsolete Gonk ECR repository until the new topology has
been accepted.

## Terraform review and apply

Run this from `deploy/aws/terraform` using a locally copied `terraform.tfvars`.
The plan file and its text rendering are review artifacts: save both into the
ignored deployment report before any apply creates billable resources.

```bash
terraform init
terraform validate
terraform plan -out=plan.tfplan
terraform show -no-color plan.tfplan | tee plan.txt
# Review plan.txt, then and only then:
terraform apply plan.tfplan
```

Use `terraform output -raw elastic_ip` after apply for DNS and external checks.

## Release and launch on the host

Push or merge the reviewed revision to `prod`. The production-images workflow
runs the repository gates, assumes the narrowly scoped AWS release role through
GitHub OIDC, builds the three Docker targets, and pushes immutable images to the
private ECR repositories. It writes the digest manifest to the versioned S3
artifact bucket and asks the existing host to deploy it through SSM Run Command.
No registry password, AWS access key, SSH key, or production secret is stored in
GitHub.

```bash
sudo install -d -m 0700 /srv/sigil-chat/{secrets,caddy-data,caddy-config}
sudo chown -R 10004:10004 /srv/sigil-chat/caddy-data /srv/sigil-chat/caddy-config

openssl rand -base64 48 | sudo tee /srv/sigil-chat/secrets/better_auth_secret >/dev/null
openssl rand -base64 48 | sudo tee /srv/sigil-chat/secrets/agent_binding_secret >/dev/null
openssl rand -base64 48 | sudo tee /srv/sigil-chat/secrets/invite_token_pepper >/dev/null
sudo chown root:10000 /srv/sigil-chat/secrets/*
sudo chmod 0440 /srv/sigil-chat/secrets/*

node deploy/aws/verify-release.mjs sigil-images.env
sudo deploy/aws/update-images.sh sigil-images.env
```

Local-only `deploy.env.local` supplies the hostname, installation ID, secret
directory, and three image digests. It must not be committed. The update pulls
the candidate images before touching the live environment, stops web traffic,
runs the candidate migration to completion, replaces the private services, and
starts the edge only after their health checks pass:

```bash
docker compose --env-file deploy.env.local ps
```

On the first deployment, run `codex login --device-auth` as the Eve service identity, with its
credential state contained in the dedicated `codex_auth` Docker volume. After
model readiness passes, activate the public edge. Device auth is a human
interaction and is never automated or stored in this repository.

The credential volume mounts into Eve only. Web, sandboxes, and backup jobs
never receive the raw Codex credential. Native application tools execute inside
Eve but receive only the scoped application context built for that invocation.

```bash
docker compose --env-file deploy.env.local exec eve codex login --device-auth
docker compose --env-file deploy.env.local exec eve pnpm --filter sigil-chat-agent healthcheck
docker compose --env-file deploy.env.local up -d edge
curl --fail "https://$PUBLIC_HOST/healthz"
```

## Operations smoke checks

Before pushing to `prod`, run the local checks that match the production-image
workflow:

```bash
pnpm typecheck
pnpm --filter '!sigil-chat-agent' -r --if-present test
pnpm --filter sigil-chat-agent exec vitest run
pnpm lint
node --test deploy/aws/*.test.mjs
```

On the host, use the private Compose health checks first. They prove web account
storage, native artifact storage, process liveness, and edge routing without
printing any secret value:

```bash
docker compose --env-file deploy.env.local ps
docker compose --env-file deploy.env.local exec web node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
docker compose --env-file deploy.env.local exec eve pnpm --filter sigil-chat-agent healthcheck
curl --fail --show-error --connect-timeout 15 "https://$PUBLIC_HOST/healthz"
```

The Eve healthcheck is intentionally model-aware and prints a small JSON report:
`codexModelAuth` and `eveRuntime` are either `ok`, `error`, or `unknown`, with a
sanitized diagnostic. If it reports missing model auth, complete
`codex login --device-auth` inside the Eve container, then run the same
healthcheck again before treating chat responses as recovered.

For rollback, dispatch the `Roll back production images` workflow with the full
40-character SHA of any previously deployed release. Its manifest remains in
the versioned artifact bucket, and the same migration/readiness gates apply:

```bash
gh workflow run prod-rollback.yml --ref prod -f release_sha=<full-release-sha>
```

On the host, the immediately previous manifest is also retained for emergency
operator rollback as `deploy.env.local.previous-images`.
This rollback mechanism applies only after the host has entered the current
three-image topology; crossing back to the former Gonk-service topology
requires the manual backup/restore procedure in the migration guide.

## Teardown

From this directory, after revoking the dedicated Codex login separately:

```bash
docker compose --env-file deploy.env.local down --volumes --remove-orphans
sudo rm -rf /srv/sigil-chat
```

Destroy the infrastructure through the same root module, then verify the
origin is gone from an unrelated network:

```bash
terraform destroy
curl --fail --connect-timeout 5 "https://$PUBLIC_HOST/healthz" && exit 1 || true
```

The release report retains only the secret-free command receipt and image
digests.

## Preconditions not faked here

- An authenticated AWS CLI profile and approved billing.
- A DNS record under the owner's control.
- Docker Engine running on the target host.
- An owner-operated device login for Eve.
