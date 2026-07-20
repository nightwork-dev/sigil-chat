# AWS single-host deployment

This is the executable shape for DEP.2: one disposable Ubuntu EC2 host, one
Elastic IP, a security group allowing only TCP 80/443, and this Compose project.
Caddy is the only public listener. Web, Eve, Gonk, and all data volumes are on
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
runs the repository gates, builds all four Docker targets, pushes them to GHCR,
and emits a `sigil-images-<commit>` artifact containing immutable digest
references. No repository secret is required; GitHub's scoped package token is
used only to publish generic images.

```bash
sudo install -d -m 0700 /srv/sigil-chat/{secrets,caddy-data,caddy-config}
sudo chown -R 10004:10004 /srv/sigil-chat/caddy-data /srv/sigil-chat/caddy-config

openssl rand -base64 48 | sudo tee /srv/sigil-chat/secrets/better_auth_secret >/dev/null
openssl rand -base64 48 | sudo tee /srv/sigil-chat/secrets/gonk_mcp_key >/dev/null
openssl rand -base64 48 | sudo tee /srv/sigil-chat/secrets/invite_token_pepper >/dev/null
sudo chmod 0400 /srv/sigil-chat/secrets/*

node deploy/aws/verify-release.mjs sigil-images.env
sudo deploy/aws/update-images.sh sigil-images.env
```

Local-only `deploy.env.local` supplies the hostname, installation ID, secret
directory, and four image digests. It must not be committed. The update starts
only the private services:

```bash
docker compose --env-file deploy.env.local ps
```

Then run `codex login --device-auth` as the Eve service identity, with its
credential state contained in the dedicated `codex_auth` Docker volume. After
model readiness passes, activate the public edge. Device auth is a human
interaction and is never automated or stored in this repository.

```bash
docker compose --env-file deploy.env.local exec eve codex login --device-auth
docker compose --env-file deploy.env.local exec eve pnpm --filter sigil-chat-agent healthcheck
docker compose --env-file deploy.env.local up -d edge
curl --fail "https://$PUBLIC_HOST/healthz"
```

For rollback, pass the prior manifest to the same update command. The script
also saves the pre-update environment as `deploy.env.local.previous`, so the
most recent change can be reversed without reconstructing a tag:

```bash
sudo deploy/aws/update-images.sh previous-sigil-images.env
```

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
