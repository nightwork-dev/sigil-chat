import { tanstackConfig } from "@tanstack/eslint-config";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  {
    name: "sigil/generated-output",
    // public/ holds served static assets (incl. vendored WASM/JS like the
    // mediapipe gaze bundle) — not TS-project source. Linting them throws
    // "parserOptions.project" parse errors that break the whole run, which is
    // how real violations (e.g. rules-of-hooks) slip past the gate.
    ignores: [
      "**/.output/**",
      "**/.tanstack/**",
      "**/.registry-staging/**",
      "**/public/**",
    ],
  },
  ...tanstackConfig,
  {
    name: "sigil/existing-code-conventions",
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      "@typescript-eslint/array-type": "off",
      "@typescript-eslint/consistent-type-imports": "off",
      "@typescript-eslint/method-signature-style": "off",
      "@typescript-eslint/naming-convention": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "import/consistent-type-specifier-style": "off",
      "import/order": "off",
      "no-regex-spaces": "off",
      // The guard for "Rendered more hooks than during the previous render" —
      // conditional hooks / hooks after an early return. Explicit + error so it
      // can never silently regress to a warning or off.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "sort-imports": "off",
    },
  },
];
