import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // eslint-plugin-react defaults to `version: "detect"`, and its detection code
  // calls `context.getFilename()` — removed in ESLint 10 — so every lint run
  // died with "contextOrFilename.getFilename is not a function" before reading
  // a single rule. Pinning the version here skips detection entirely.
  // Keep in sync with the `react` version in package.json.
  {
    settings: { react: { version: "19.2" } },
  },

  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
