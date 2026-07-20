import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const directory = new URL(".", import.meta.url).pathname
const compose = readFileSync(resolve(directory, "compose.yaml"), "utf8")
const runbook = readFileSync(resolve(directory, "EXECUTION-RUNBOOK.md"), "utf8")

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
  const updateScript = readFileSync(
    resolve(directory, "update-images.sh"),
    "utf8",
  )
  assert.match(updateScript, /up -d migrate web gonk eve/)
  assert.doesNotMatch(updateScript, /up -d --remove-orphans/)
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
  assert.match(compose, /SIGIL_ARTIFACT_DIR: \/var\/lib\/sigil-gonk\/artifacts/)
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
  assert.match(storageInit, /install -d -o 10000 -g 10000 -m 0700/)
  for (const volume of ["blackboard_data", "codex_auth", "eve_identity"]) {
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
  assert.doesNotMatch(gonk, /CODEX_HOME|CODEX_AUTH_FILE|codex_auth/)
  assert.match(gonk, /SIGIL_LOCAL_CODEX_IMAGE_GENERATION: disabled/)
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
