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

test("fresh deployment orders containers on Eve liveness, not model auth", () => {
  const eveService = compose.slice(
    compose.indexOf("\n  eve:"),
    compose.indexOf("\n  gonk:"),
  )
  assert.match(eveService, /\/eve\/v1\/health/)
  assert.doesNotMatch(eveService, /sigil-chat-agent[^\n]*healthcheck/)
})

test("Eve keeps public JWT identity separate from internal JWKS routing", () => {
  const eveService = compose.slice(
    compose.indexOf("\n  eve:"),
    compose.indexOf("\n  gonk:"),
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

test("production image CI builds the four private ECR targets with OIDC", () => {
  assert.match(productionWorkflow, /id-token: write/)
  assert.match(productionWorkflow, /aws-actions\/configure-aws-credentials/)
  assert.match(productionWorkflow, /Log in to private ECR/)
  assert.match(
    productionWorkflow,
    /matrix:\s+target: \[migrate, web, eve, gonk\]/,
  )
  assert.match(
    productionWorkflow,
    /tags: \$\{\{ vars\.ECR_REGISTRY \}\}\/sigil-chat-\$\{\{ matrix\.target \}\}:\$\{\{ github\.sha \}\}-\$\{\{ github\.run_attempt \}\}/,
  )
  assert.match(productionWorkflow, /printf '%s=%s\/sigil-chat-%s@%s\\n'/)
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
  const updateScript = readFileSync(
    resolve(directory, "update-images.sh"),
    "utf8",
  )
  assert.ok(
    updateScript.indexOf("stop edge web") <
      updateScript.indexOf(
        "up --abort-on-container-exit --exit-code-from migrate migrate",
      ),
  )
  assert.ok(
    updateScript.indexOf(
      "up --abort-on-container-exit --exit-code-from migrate migrate",
    ) < updateScript.lastIndexOf("up -d --wait --no-deps web gonk eve"),
  )
  assert.match(updateScript, /up -d --wait --no-deps edge/)
})

test("edge health uses a non-redirecting internal Caddy listener", () => {
  assert.match(caddyfile, /:8081 \{\s+respond \/healthz 200\s+\}/)
  assert.match(compose, /http:\/\/127\.0\.0\.1:8081\/healthz/)
})

test("production services share writable blackboard storage", () => {
  for (const serviceName of ["web", "eve", "gonk"]) {
    const start = compose.indexOf(`\n  ${serviceName}:`)
    const nextMatch = /\n  [a-z][a-z-]+:/g
    nextMatch.lastIndex = start + serviceName.length + 4
    const next = nextMatch.exec(compose)?.index ?? compose.length
    const service = compose.slice(start, next)
    assert.match(service, /SIGIL_BLACKBOARD_DIR: \/var\/lib\/sigil-blackboard/)
    assert.match(service, /blackboard_data:\/var\/lib\/sigil-blackboard/)
  }
  assert.match(compose, /SIGIL_DATA_DIR: \/var\/lib\/sigil-gonk/)
})

test("web and Gonk share writable durable roadmap storage", () => {
  for (const serviceName of ["web", "gonk"]) {
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

test("web and Gonk share the authoritative container registry store", () => {
  for (const serviceName of ["web", "gonk"]) {
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
  assert.equal(dockerfile.match(/USER 10000:10000/g)?.length, 4)
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
    "gonk_data",
    "gonk_scope",
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
  const gonkStart = compose.indexOf("\n  gonk:")
  const eve = compose.slice(eveStart, gonkStart)
  const gonk = compose.slice(gonkStart, compose.indexOf("\n  edge:"))
  assert.match(eve, /CODEX_HOME: \/var\/lib\/sigil-codex/)
  assert.match(eve, /codex_auth:\/var\/lib\/sigil-codex/)
  assert.doesNotMatch(eve, /eve_app:\/app\/apps\/agent/)
  assert.doesNotMatch(gonk, /CODEX_HOME|CODEX_AUTH_FILE|codex_auth/)
  assert.match(gonk, /SIGIL_LOCAL_CODEX_IMAGE_GENERATION: disabled/)
})

test("storage initialization migrates a legacy Codex login once", () => {
  const storageInit = compose.slice(
    compose.indexOf("\n  storage-init:"),
    compose.indexOf("\n  migrate:"),
  )
  assert.match(storageInit, /\[ ! -s \/var\/lib\/sigil-codex\/auth\.json \]/)
  assert.match(
    storageInit,
    /\[ -s \/var\/lib\/sigil-eve\/codex-home\/auth\.json \]/,
  )
  assert.match(storageInit, /install -o 10000 -g 10000 -m 0600/)
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
