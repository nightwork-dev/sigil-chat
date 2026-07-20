import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const directory = new URL(".", import.meta.url).pathname
const compose = readFileSync(resolve(directory, "compose.yaml"), "utf8")
const runbook = readFileSync(
  resolve(directory, "EXECUTION-RUNBOOK.md"),
  "utf8",
)

test("fresh deployment orders containers on Eve liveness, not model auth", () => {
  const eveService = compose.slice(
    compose.indexOf("\n  eve:"),
    compose.indexOf("\n  gonk:"),
  )
  assert.match(eveService, /\/eve\/v1\/health/)
  assert.doesNotMatch(eveService, /sigil-chat-agent[^\n]*healthcheck/)
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

test("update command leaves the public edge stopped", () => {
  const updateScript = readFileSync(resolve(directory, "update-images.sh"), "utf8")
  assert.match(updateScript, /up -d migrate web gonk eve/)
  assert.doesNotMatch(updateScript, /up -d --remove-orphans/)
})

test("production services share writable blackboard storage", () => {
  for (const serviceName of ["web", "eve", "gonk"]) {
    const start = compose.indexOf(`\n  ${serviceName}:`)
    const next = compose.indexOf("\n  ", start + 4)
    const service = compose.slice(start, next)
    assert.match(service, /SIGIL_BLACKBOARD_DIR: \/var\/lib\/sigil-blackboard/)
    assert.match(service, /blackboard_data:\/var\/lib\/sigil-blackboard/)
  }
  assert.match(compose, /SIGIL_ARTIFACT_DIR: \/var\/lib\/sigil-gonk\/artifacts/)
})

test("only Eve receives the persistent Codex credential volume", () => {
  const eveStart = compose.indexOf("\n  eve:")
  const gonkStart = compose.indexOf("\n  gonk:")
  const eve = compose.slice(eveStart, gonkStart)
  const gonk = compose.slice(gonkStart, compose.indexOf("\n  edge:"))
  assert.match(eve, /CODEX_HOME: \/var\/lib\/sigil-codex/)
  assert.match(eve, /codex_auth:\/var\/lib\/sigil-codex/)
  assert.doesNotMatch(gonk, /CODEX_HOME|codex_auth/)
})

test("production image disables KVM tools during Eve compilation", () => {
  const dockerfile = readFileSync(resolve(directory, "../../Dockerfile"), "utf8")
  const eveBuild = dockerfile.slice(
    dockerfile.indexOf("FROM source AS eve-build"),
    dockerfile.indexOf("FROM source AS migrate"),
  )
  assert.match(eveBuild, /ENV SIGIL_SANDBOX_MODE=disabled/)
})
