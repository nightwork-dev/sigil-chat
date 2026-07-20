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

## Build and launch on the host

The host receives a reviewed source revision only. It builds three local images
from the one root `Dockerfile`, then records their immutable digests in its
untracked `deploy.env.local`:

```bash
sudo install -d -m 0700 /srv/sigil-chat/{secrets,caddy-data,caddy-config}
sudo chown -R 10004:10004 /srv/sigil-chat/caddy-data /srv/sigil-chat/caddy-config

openssl rand -base64 48 | sudo tee /srv/sigil-chat/secrets/better_auth_secret >/dev/null
openssl rand -base64 48 | sudo tee /srv/sigil-chat/secrets/gonk_mcp_key >/dev/null
sudo chmod 0400 /srv/sigil-chat/secrets/*

docker build --target web -t sigil-chat-web:launch .
docker build --target migrate -t sigil-chat-migrate:launch .
docker build --target eve -t sigil-chat-eve:launch .
docker build --target gonk -t sigil-chat-gonk:launch .

docker image inspect sigil-chat-web:launch --format '{{index .RepoDigests 0}}'
docker image inspect sigil-chat-eve:launch --format '{{index .RepoDigests 0}}'
docker image inspect sigil-chat-gonk:launch --format '{{index .RepoDigests 0}}'
```

Local-only `deploy.env.local` supplies the hostname, installation ID, secret
directory, and three image digests. It must not be committed. Once DNS resolves
to the host, bring up the deployment from this directory:

```bash
docker compose --env-file deploy.env.local up -d
docker compose --env-file deploy.env.local ps
curl --fail --resolve "$PUBLIC_HOST:443:127.0.0.1" "https://$PUBLIC_HOST/healthz"
```

Then run `codex login --device-auth` as the Eve service identity, with its
credential state contained in the `eve_data` Docker volume. That is a human
device-auth interaction and is never automated or stored in this repository.

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
