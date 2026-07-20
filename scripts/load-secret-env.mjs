import { readFileSync, statSync } from "node:fs"
import { spawn } from "node:child_process"

const separator = process.argv.indexOf("--")
if (separator < 1 || separator === process.argv.length - 1) {
  throw new Error("Usage: load-secret-env.mjs NAME [NAME...] -- command [args...]")
}

const secretNames = process.argv.slice(2, separator)
const command = process.argv.slice(separator + 1)
const environment = { ...process.env }

for (const name of secretNames) {
  const fileVariable = `${name}_FILE`
  const file = environment[fileVariable]
  if (!file) continue

  let value
  try {
    if (!statSync(file).isFile()) throw new Error("not a regular file")
    value = readFileSync(file, "utf8").trim()
  } catch {
    throw new Error(`${fileVariable} is unreadable`)
  }
  if (!value) throw new Error(`${fileVariable} is empty`)
  if (environment[name] && environment[name] !== value) {
    throw new Error(`${name} and ${fileVariable} disagree`)
  }

  environment[name] = value
  delete environment[fileVariable]
}

const child = spawn(command[0], command.slice(1), {
  env: environment,
  stdio: "inherit",
})

child.once("error", (error) => {
  console.error(`Unable to start ${command[0]}: ${error.message}`)
  process.exit(1)
})
child.once("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 1)
})
