# One-time migration from the Gonk service

This guide applies only to an existing production installation that still runs
the old `gonk` Compose service. Fresh installations do not need it.

The updater deliberately refuses that topology. It does not copy legacy data,
remove the old container, or keep a compatibility service alive. Make a backup,
perform this one-time operator cutover, verify the result, and then discard this
guide when the old topology no longer exists.

## 1. Back up and stop the old application

Record the currently deployed image manifest and back up both named volumes
before changing anything:

```bash
cd /opt/sigil-chat/deploy
sudo cp -p deploy.env.local deploy.env.local.before-eve-host
sudo docker run --rm \
  -v sigil-chat_gonk_data:/source:ro \
  -v /srv/sigil-chat:/backup \
  alpine:3.22 \
  tar -C /source -czf /backup/gonk-data-before-eve-host.tgz .
old_ids="$(
  sudo docker ps -q \
    --filter label=com.docker.compose.project=sigil-chat
)"
[ -z "$old_ids" ] || sudo docker stop $old_ids
```

Do not continue unless the backup exists and is non-empty.

## 2. Copy application data into the shared Web/Eve volume

The old Gonk volume contains application-owned `artifacts`, `graph`, `review`,
and managed `skills` directories. The new topology reads those directories from
`sigil-chat_web_data`. Copy them only into an empty destination; do not merge
two live stores.

```bash
sudo docker run --rm \
  -v sigil-chat_gonk_data:/legacy:ro \
  -v sigil-chat_web_data:/current \
  alpine:3.22 sh -euc '
    for name in artifacts graph review skills; do
      [ ! -e "/current/$name" ] ||
        { echo "Refusing to overwrite /current/$name" >&2; exit 1; }
      [ ! -e "/legacy/$name" ] || cp -a "/legacy/$name" /current/
    done
    chown -R 10000:10000 /current
  '
```

If the destination is not empty, stop and reconcile it from backups. There is
no supported automatic merge.

## 3. Remove the obsolete service boundary

Remove only the old Gonk service container, then delete obsolete Gonk settings
from `deploy.env.local`:

```bash
legacy_ids="$(
  sudo docker ps -aq \
    --filter label=com.docker.compose.project=sigil-chat \
    --filter label=com.docker.compose.service=gonk
)"
[ -z "$legacy_ids" ] || sudo docker rm "$legacy_ids"
sudo sed -i.bak \
  -e '/^SIGIL_GONK_IMAGE=/d' \
  -e '/^GONK_MCP_URL=/d' \
  -e '/^GONK_MCP_KEY=/d' \
  -e '/^GONK_MCP_KEY_FILE=/d' \
  deploy.env.local
```

Retain the old `sigil-chat_gonk_data` volume and any old Gonk secret file until
the new release is verified. Do not use `docker compose --remove-orphans` as a
substitute for identifying and backing up the legacy service.

## 4. Deploy and verify

Run the normal three-image updater, then verify Web, Eve, the public edge, and
the application data:

```bash
sudo ./update-images.sh sigil-images.env
sudo docker compose --env-file deploy.env.local -f compose.yaml ps
sudo docker compose --env-file deploy.env.local -f compose.yaml exec \
  eve codex login --device-auth
sudo docker compose --env-file deploy.env.local -f compose.yaml exec \
  eve pnpm --filter sigil-chat-agent healthcheck
```

Open Artifacts, Evidence, Studio, and Review and confirm the expected records
are visible. The former deployment-global `project:evidence-room` scope is not
rebound to a user automatically; re-upload any retained global Evidence Room
documents into the intended user's registered personal project. This topology
boundary does not support automatic rollback to the old four-image deployment.
Restore the saved manifest and volume backup manually if the cutover must be
abandoned.

After the new topology is accepted and its own backup has succeeded, the old
volume and secret can be removed explicitly:

```bash
sudo docker volume rm sigil-chat_gonk_data
sudo rm -f /srv/sigil-chat/secrets/gonk_mcp_key
```
