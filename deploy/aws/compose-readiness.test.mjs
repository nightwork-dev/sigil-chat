import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const directory = new URL(".", import.meta.url).pathname
const compose = readFileSync(resolve(directory, "compose.yaml"), "utf8")
const caddyfile = readFileSync(resolve(directory, "Caddyfile"), "utf8")
const runbook = readFileSync(resolve(directory, "EXECUTION-RUNBOOK.md"), "utf8")
const releaseTerraform = readFileSync(
  resolve(directory, "terraform/release.tf"),
  "utf8",
)
const productionWorkflow = readFileSync(
  resolve(directory, "../../.github/workflows/prod-images.yml"),
  "utf8",
)
const rollbackWorkflow = readFileSync(
  resolve(directory, "../../.github/workflows/prod-rollback.yml"),
  "utf8",
)
const provisionHost = readFileSync(
  resolve(directory, "provision-host.sh"),
  "utf8",
)
const deploymentReadme = readFileSync(resolve(directory, "README.md"), "utf8")
const migrationGuide = readFileSync(
  resolve(directory, "MIGRATING-FROM-GONK-SERVICE.md"),
  "utf8",
)
const updateScript = readFileSync(
  resolve(directory, "update-images.sh"),
  "utf8",
)

test("fresh deployment orders containers on Eve liveness, not model auth", () => {
  const eveService = compose.slice(
    compose.indexOf("\n  eve:"),
    compose.indexOf("\n  edge:"),
  )
  assert.match(eveService, /\/eve\/v1\/health/)
  assert.doesNotMatch(eveService, /sigil-chat-agent[^\n]*healthcheck/)
})

test("Eve keeps public JWT identity separate from internal JWKS routing", () => {
  const eveService = compose.slice(
    compose.indexOf("\n  eve:"),
    compose.indexOf("\n  edge:"),
  )
  assert.match(
    eveService,
    /SIGIL_PUBLIC_URL: https:\/\/\$\{PUBLIC_HOST:\?set PUBLIC_HOST\}/,
  )
  assert.match(
    eveService,
    /SIGIL_EVE_AUTH_JWKS_URL: http:\/\/web:3000\/api\/auth\/jwks/,
  )
})

test("runbook proves model readiness only after device login", () => {
  const login = runbook.indexOf("codex login --device-auth")
  const readiness = runbook.indexOf(
    "pnpm --filter sigil-chat-agent healthcheck",
  )
  const edge = runbook.indexOf("up -d edge", readiness)
  assert.ok(login >= 0)
  assert.ok(readiness > login)
  assert.ok(edge > readiness)
})

test("SSM downloads release manifests from an HTTPS S3 URL", () => {
  assert.match(releaseTerraform, /sourceType: S3/)
  assert.match(
    releaseTerraform,
    /sourceInfo: '\{"path":"https:\/\/s3\.\$\{var\.aws_region\}\.amazonaws\.com\//,
  )
  assert.doesNotMatch(releaseTerraform, /sourceInfo: '\{"path":"s3:\/\//)
})

test("each release ships and executes its versioned deployment contract", () => {
  assert.match(productionWorkflow, /tar -C deploy\/aws -czf deploy\.tgz/)
  assert.match(productionWorkflow, /aws s3 cp deploy\.tgz "\$deploy_uri"/)
  assert.match(releaseTerraform, /name: downloadDeployBundle/)
  assert.match(releaseTerraform, /releases\/\{\{ ReleaseSha \}\}\/deploy\.tgz/)
  assert.match(
    releaseTerraform,
    /releases\/\{\{ ReleaseSha \}\}\/deploy\/update-images\.sh/,
  )
  assert.doesNotMatch(
    releaseTerraform,
    /'\/opt\/sigil-chat\/deploy\/update-images\.sh/,
  )
})

test("release workflows allow the host updater fifteen minutes", () => {
  for (const workflow of [productionWorkflow, rollbackWorkflow]) {
    assert.doesNotMatch(workflow, /aws ssm wait command-executed/)
    assert.match(workflow, /for attempt in \$\(seq 1 60\)/)
    assert.match(workflow, /Pending\|InProgress\|Delayed\) sleep 15/)
  }
})

test("production image CI builds the three private ECR targets with OIDC", () => {
  assert.match(productionWorkflow, /id-token: write/)
  assert.match(productionWorkflow, /aws-actions\/configure-aws-credentials/)
  assert.match(productionWorkflow, /Log in to private ECR/)
  assert.match(productionWorkflow, /matrix:\s+target: \[migrate, web, eve\]/)
  assert.match(
    productionWorkflow,
    /tags: \$\{\{ vars\.ECR_REGISTRY \}\}\/sigil-chat-\$\{\{ matrix\.target \}\}:\$\{\{ github\.sha \}\}-\$\{\{ github\.run_attempt \}\}/,
  )
  assert.match(productionWorkflow, /printf '%s=%s\/sigil-chat-%s@%s\\n'/)
  assert.match(
    productionWorkflow,
    /test "\$\(wc -l < sigil-images\.env\)" -eq 3/,
  )
  assert.doesNotMatch(
    productionWorkflow,
    /ghcr\.io|GITHUB_TOKEN|packages: write/,
  )
})

test("production CI gates image builds with local smoke contracts", () => {
  const verifyJob = productionWorkflow.slice(
    productionWorkflow.indexOf("\n  verify:"),
    productionWorkflow.indexOf("\n  build:"),
  )
  assert.match(verifyJob, /pnpm typecheck/)
  assert.match(
    verifyJob,
    /pnpm --filter '!sigil-chat-agent' -r --if-present test/,
  )
  assert.match(verifyJob, /pnpm --filter sigil-chat-agent exec vitest run/)
  assert.match(verifyJob, /pnpm lint/)
  assert.match(verifyJob, /node --test deploy\/aws\/\*\.test\.mjs/)
})

test("update command stops the public edge before replacing services", () => {
  assert.ok(
    updateScript.indexOf("stop edge web") <
      updateScript.indexOf(
        "up --abort-on-container-exit --exit-code-from migrate migrate",
      ),
  )
  assert.ok(
    updateScript.indexOf(
      "up --abort-on-container-exit --exit-code-from migrate migrate",
    ) < updateScript.lastIndexOf("up -d --wait --no-deps web eve"),
  )
  assert.match(updateScript, /up -d --wait --no-deps edge/)
})

test("old Gonk topology fails closed before the updater mutates Docker state", () => {
  const preflight = updateScript.indexOf("legacy_gonk_containers")
  const firstMutation = updateScript.indexOf('cp "$deploy_env" "$rollback_env"')
  assert.ok(preflight >= 0 && preflight < firstMutation)
  assert.match(
    updateScript,
    /label=com\.docker\.compose\.service=gonk/,
  )
  assert.match(updateScript, /MIGRATING-FROM-GONK-SERVICE\.md/)
  assert.doesNotMatch(updateScript, /--remove-orphans/)
  assert.match(migrationGuide, /does not copy legacy data/)
  assert.match(migrationGuide, /sigil-chat_gonk_data/)
  assert.match(migrationGuide, /sigil-chat_web_data/)
  assert.match(migrationGuide, /does not support automatic rollback/)
})

test("edge health uses a non-redirecting internal Caddy listener", () => {
  assert.match(caddyfile, /:8081 \{\s+respond \/healthz 200\s+\}/)
  assert.match(compose, /http:\/\/127\.0\.0\.1:8081\/healthz/)
})

test("production services share writable blackboard storage", () => {
  for (const serviceName of ["web", "eve"]) {
    const start = compose.indexOf(`\n  ${serviceName}:`)
    const nextMatch = /\n  [a-z][a-z-]+:/g
    nextMatch.lastIndex = start + serviceName.length + 4
    const next = nextMatch.exec(compose)?.index ?? compose.length
    const service = compose.slice(start, next)
    assert.match(service, /SIGIL_BLACKBOARD_DIR: \/var\/lib\/sigil-blackboard/)
    assert.match(service, /blackboard_data:\/var\/lib\/sigil-blackboard/)
  }
  assert.equal(
    compose.match(/SIGIL_DATA_DIR: \/var\/lib\/sigil-web/g)?.length,
    3,
  )
})

test("web and Eve share writable durable roadmap storage", () => {
  for (const serviceName of ["web", "eve"]) {
    const start = compose.indexOf(`\n  ${serviceName}:`)
    const nextMatch = /\n  [a-z][a-z-]+:/g
    nextMatch.lastIndex = start + serviceName.length + 4
    const next = nextMatch.exec(compose)?.index ?? compose.length
    const service = compose.slice(start, next)
    assert.match(service, /SIGIL_ROADMAP_DIR: \/var\/lib\/sigil-roadmap/)
    assert.match(service, /roadmap_data:\/var\/lib\/sigil-roadmap/)
  }
  const storageInit = compose.slice(
    compose.indexOf("\n  storage-init:"),
    compose.indexOf("\n  migrate:"),
  )
  assert.match(storageInit, /roadmap_data:\/var\/lib\/sigil-roadmap/)
  assert.match(storageInit, /\/var\/lib\/sigil-roadmap/)
})

test("web and Eve share the authoritative container registry store", () => {
  for (const serviceName of ["web", "eve"]) {
    const start = compose.indexOf(`\n  ${serviceName}:`)
    const nextMatch = /\n  [a-z][a-z-]+:/g
    nextMatch.lastIndex = start + serviceName.length + 4
    const next = nextMatch.exec(compose)?.index ?? compose.length
    const service = compose.slice(start, next)
    assert.match(
      service,
      /SIGIL_CONTAINER_REGISTRY_ROOT: \/var\/lib\/sigil-containers/,
    )
    assert.match(
      service,
      /container_registry_data:\/var\/lib\/sigil-containers/,
    )
  }
  const storageInit = compose.slice(
    compose.indexOf("\n  storage-init:"),
    compose.indexOf("\n  migrate:"),
  )
  assert.match(
    storageInit,
    /container_registry_data:\/var\/lib\/sigil-containers/,
  )
  assert.match(storageInit, /\/var\/lib\/sigil-containers/)
})

test("shared stores are initialized for one runtime filesystem identity", () => {
  const dockerfile = readFileSync(
    resolve(directory, "../../Dockerfile"),
    "utf8",
  )
  assert.equal(dockerfile.match(/USER 10000:10000/g)?.length, 3)
  const storageInit = compose.slice(
    compose.indexOf("\n  storage-init:"),
    compose.indexOf("\n  migrate:"),
  )
  assert.match(storageInit, /user: "0:0"/)
  assert.match(
    storageInit,
    /cap_add: \[CHOWN, FOWNER, DAC_OVERRIDE, DAC_READ_SEARCH\]/,
  )
  assert.match(storageInit, /chown -R 10000:10000/)
  for (const volume of [
    "web_data",
    "web_scope",
    "web_appdata",
    "eve_data",
    "eve_scope",
    "blackboard_data",
    "roadmap_data",
    "container_registry_data",
    "codex_auth",
    "eve_identity",
  ]) {
    assert.match(storageInit, new RegExp(`${volume}:`))
  }
})

test("only Eve receives the persistent Codex credential volume", () => {
  const eveStart = compose.indexOf("\n  eve:")
  const eve = compose.slice(eveStart, compose.indexOf("\n  edge:"))
  const web = compose.slice(
    compose.indexOf("\n  web:"),
    compose.indexOf("\n  eve:"),
  )
  assert.match(eve, /CODEX_HOME: \/var\/lib\/sigil-codex/)
  assert.match(eve, /codex_auth:\/var\/lib\/sigil-codex/)
  assert.doesNotMatch(eve, /eve_app:\/app\/apps\/agent/)
  assert.doesNotMatch(web, /CODEX_HOME|CODEX_AUTH_FILE|codex_auth/)
})

test("storage initialization does not carry legacy state into the new topology", () => {
  const storageInit = compose.slice(
    compose.indexOf("\n  storage-init:"),
    compose.indexOf("\n  migrate:"),
  )
  assert.doesNotMatch(storageInit, /sigil-eve\/codex-home/)
  assert.doesNotMatch(storageInit, /sigil-gonk|gonk_data|gonk_scope/)
})

test("host secrets are readable only by root and the runtime group", () => {
  assert.match(provisionHost, /chown root:10000 "\$path"/)
  assert.match(provisionHost, /chmod 0440 "\$path"/)
  assert.doesNotMatch(provisionHost, /chmod 04(?:00|44) "\$path"/)
  assert.match(
    deploymentReadme,
    /chown root:10000 \/srv\/sigil-chat\/secrets\/\*/,
  )
  assert.match(deploymentReadme, /chmod 0440 \/srv\/sigil-chat\/secrets\/\*/)
  assert.doesNotMatch(
    deploymentReadme,
    /chmod 0400 \/srv\/sigil-chat\/secrets\/\*/,
  )
})

test("production image disables KVM tools during Eve compilation", () => {
  const dockerfile = readFileSync(
    resolve(directory, "../../Dockerfile"),
    "utf8",
  )
  const eveBuild = dockerfile.slice(
    dockerfile.indexOf("FROM source AS eve-build"),
    dockerfile.indexOf("FROM source AS migrate"),
  )
  assert.match(eveBuild, /ENV SIGIL_SANDBOX_MODE=disabled/)
})
