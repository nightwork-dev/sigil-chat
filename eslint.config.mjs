import { tanstackConfig } from "@tanstack/eslint-config";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  {
    name: "sigil/generated-output",
    ignores: ["**/.output/**", "**/.tanstack/**", "**/.registry-staging/**"],
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
      "react-hooks/exhaustive-deps": "warn",
      "sort-imports": "off",
    },
  },
];
