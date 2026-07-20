import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const variants = ["compose.device-auth.yaml", "compose.api-auth.yaml"];

for (const overlay of variants) {
  const output = execFileSync(
    "docker",
    [
      "compose",
      "--env-file",
      join(root, ".env.example"),
      "-f",
      join(root, "compose.yaml"),
      "-f",
      join(root, overlay),
      "config",
      "--format",
      "json",
    ],
    { encoding: "utf8" },
  );
  verifyCompose(JSON.parse(output), overlay);
}

const fixtureText = readdirSync(root)
  .filter((name) => !name.startsWith("verify-static"))
  .map((name) => readFileSync(join(root, name), "utf8"))
  .join("\n");

if (
  /https?:\/\/(?![^\s/]*\.invalid\b)(?!web\b)(?!eve\b)(?!gonk\b)(?!127\.0\.0\.1\b)/i.test(
    fixtureText,
  )
) {
  throw new Error("fixture contains a non-.invalid HTTP hostname");
}

if (
  /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{16,}/.test(
    fixtureText,
  )
) {
  throw new Error("fixture contains secret-shaped literal material");
}

console.log("invite-demo fixture static contract: ok");

function verifyCompose(config, overlay) {
  const services = config.services ?? {};
  const portPublishers = Object.entries(services)
    .filter(([, service]) => (service.ports?.length ?? 0) > 0)
    .map(([name]) => name);

  assert(
    portPublishers.length === 1 && portPublishers[0] === "edge",
    `${overlay}: only edge may publish ports`,
  );
  assert(
    config.networks?.backend?.internal === true,
    `${overlay}: backend must be internal`,
  );

  for (const [name, service] of Object.entries(services)) {
    assert(
      service.privileged !== true,
      `${overlay}: ${name} must not be privileged`,
    );
    const sources = (service.volumes ?? []).map((volume) =>
      typeof volume === "string" ? volume : (volume.source ?? ""),
    );
    assert(
      !sources.some((source) => source === "/var/run/docker.sock"),
      `${overlay}: ${name} must not mount the Docker socket`,
    );
    if (["web", "eve", "gonk"].includes(name)) {
      assert(
        service.environment?.SIGIL_EXEC_MODE === "disabled",
        `${overlay}: ${name} must disable exec`,
      );
    }
  }

  const secretConsumers = new Map();
  for (const [name, service] of Object.entries(services)) {
    for (const secret of service.secrets ?? []) {
      const source = typeof secret === "string" ? secret : secret.source;
      const consumers = secretConsumers.get(source) ?? [];
      consumers.push(name);
      secretConsumers.set(source, consumers);
    }
  }

  if (overlay === "compose.device-auth.yaml") {
    const codexMounts = Object.entries(services)
      .filter(([, service]) =>
        (service.volumes ?? []).some((volume) =>
          JSON.stringify(volume).includes("codex-home"),
        ),
      )
      .map(([name]) => name);
    assert(
      codexMounts.length === 1 && codexMounts[0] === "eve",
      `${overlay}: CODEX_HOME must mount only into Eve`,
    );
  } else {
    const consumers = secretConsumers.get("model_api_credential") ?? [];
    assert(
      consumers.length === 1 && consumers[0] === "eve",
      `${overlay}: model API credential must mount only into Eve`,
    );
  }

  for (const [name, service] of Object.entries(services)) {
    for (const [key, value] of Object.entries(service.environment ?? {})) {
      if (/(SECRET|TOKEN|KEY|PASSWORD)$/.test(key) && !key.endsWith("_FILE")) {
        throw new Error(`${overlay}: ${name}.${key} must use a secret file`);
      }
      if (
        typeof value === "string" &&
        /BEGIN PRIVATE KEY|sk-[A-Za-z0-9_-]{16,}/.test(value)
      ) {
        throw new Error(
          `${overlay}: ${name}.${key} contains secret-shaped material`,
        );
      }
    }
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
