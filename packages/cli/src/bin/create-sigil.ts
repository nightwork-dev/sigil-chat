#!/usr/bin/env node
// npm create sigil / npx create-sigil compatibility entrypoint.

process.env.SIGIL_EMBEDDED_ENTRYPOINT = "1";

import("./sigil")
  .then(({ runCli }) => runCli(["create", ...process.argv.slice(2)]))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
