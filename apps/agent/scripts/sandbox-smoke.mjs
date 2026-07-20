import assert from "node:assert/strict";

import { microsandbox } from "eve/sandbox/microsandbox";

const backend = microsandbox({
  networkPolicy: "deny-all",
  pullPolicy: "if-missing",
});
const createInput = {
  runtimeContext: { appRoot: process.cwd() },
  sessionKey: "sigil-chat-sandbox-smoke",
  templateKey: null,
};
const expected = `persistent-${Date.now()}`;

const firstHandle = await backend.create(createInput);
await firstHandle.session.writeTextFile({
  content: expected,
  path: "repl-state.txt",
});
const state = await firstHandle.captureState();
await firstHandle.shutdown();

const resumedHandle = await backend.create({
  ...createInput,
  existingMetadata: state.metadata,
});

try {
  assert.equal(
    await resumedHandle.session.readTextFile({ path: "repl-state.txt" }),
    expected,
    "the resumed session should retain its /workspace files",
  );

  const curlAvailable = await resumedHandle.session.run({
    command: "command -v curl",
  });
  assert.equal(
    curlAvailable.exitCode,
    0,
    "the smoke image must provide curl for the network assertion",
  );

  const networkAttempt = await resumedHandle.session.run({
    command:
      "curl --connect-timeout 3 --fail --silent --show-error http://1.1.1.1",
  });
  assert.notEqual(
    networkAttempt.exitCode,
    0,
    "the sandbox should reject outbound network connections",
  );
} finally {
  await resumedHandle.captureState();
  await resumedHandle.shutdown();
}

console.log("Sandbox persistence and deny-all networking verified.");
