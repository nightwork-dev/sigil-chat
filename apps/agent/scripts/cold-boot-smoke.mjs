import { cpSync, mkdtempSync, rmSync, symlinkSync } from "node:fs"
import { once } from "node:events"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { spawn } from "node:child_process"

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const appDirectory = resolve(scriptDirectory, "..")
const fixtureDirectory = mkdtempSync(join(tmpdir(), "sigil-eve-cold-boot-"))
const output = []
let child

try {
  cpSync(join(appDirectory, "agent"), join(fixtureDirectory, "agent"), {
    filter: (source) => !source.split("/").includes(".agents"),
    recursive: true,
  })
  cpSync(
    join(appDirectory, "package.json"),
    join(fixtureDirectory, "package.json"),
  )
  cpSync(
    join(appDirectory, "tsconfig.json"),
    join(fixtureDirectory, "tsconfig.json"),
  )
  cpSync(join(appDirectory, "scripts"), join(fixtureDirectory, "scripts"), {
    recursive: true,
  })
  symlinkSync(join(appDirectory, "node_modules"), join(fixtureDirectory, "node_modules"))

  const port = await reservePort()
  child = spawn(
    process.execPath,
    [
      join(fixtureDirectory, "node_modules", "eve", "bin", "eve.js"),
      "dev",
      "--no-ui",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      cwd: fixtureDirectory,
      env: {
        ...process.env,
        SIGIL_EVE_ALLOW_LOCAL_DEV_AUTH: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  )
  child.stdout.on("data", (chunk) => capture(chunk))
  child.stderr.on("data", (chunk) => capture(chunk))

  const response = await waitForInfoRoute(child, port)
  const body = await response.json()
  if (body.agent?.name !== "sigil-chat-agent") {
    throw new Error(
      `Cold-boot info route returned an unexpected agent: ${JSON.stringify(body)}`,
    )
  }

  const frameworkTodo = body.tools?.framework?.find(
    (tool) => tool.name === "todo",
  )
  const authoredTodo = body.tools?.authored?.find(
    (tool) => tool.name === "todo",
  )
  if (
    frameworkTodo?.status !== "active" ||
    frameworkTodo.origin !== "framework" ||
    authoredTodo !== undefined
  ) {
    throw new Error(
      `Cold-boot agent did not expose Eve's native todo tool: ${JSON.stringify(body.tools)}`,
    )
  }

  console.log(
    "Eve cold-boot smoke passed: fresh snapshot served /eve/v1/info 200 with the native todo tool",
  )
} catch (error) {
  if (output.length > 0) {
    console.error(output.join("").slice(-20_000))
  }
  throw error
} finally {
  if (child && child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL")
    await once(child, "exit")
  }
  rmSync(fixtureDirectory, { force: true, recursive: true })
}

function capture(chunk) {
  output.push(String(chunk))
  if (output.length > 200) output.shift()
}

async function reservePort() {
  const server = createServer()
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolvePromise)
  })
  const address = server.address()
  if (typeof address !== "object" || address === null) {
    server.close()
    throw new Error("Could not reserve a loopback port for the cold-boot smoke")
  }
  await new Promise((resolvePromise, reject) =>
    server.close((error) => (error ? reject(error) : resolvePromise())),
  )
  return address.port
}

async function waitForInfoRoute(processHandle, port) {
  const deadline = Date.now() + Number(process.env.COLD_BOOT_TIMEOUT_MS ?? 60_000)
  const url = `http://127.0.0.1:${port}/eve/v1/info`
  let lastProbeFailure = "no response received"

  while (Date.now() < deadline) {
    if (processHandle.exitCode !== null) {
      throw new Error(
        `Eve exited before its cold-boot info route was ready (exit ${processHandle.exitCode})`,
      )
    }
    try {
      const response = await fetch(url)
      if (response.status === 200) return response
      lastProbeFailure = `HTTP ${response.status}`
      // Eve 0.27 starts Nitro before its first compiler publication. During
      // that narrow window /eve/v1/info can return 500 (missing manifest)
      // rather than 503; cold boot is healthy if the compiler publishes and
      // the same route becomes ready before the deadline.
    } catch (error) {
      lastProbeFailure = error instanceof Error ? error.message : String(error)
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250))
  }

  throw new Error(
    `Timed out waiting for Eve's cold-boot info route (${lastProbeFailure})`,
  )
}
