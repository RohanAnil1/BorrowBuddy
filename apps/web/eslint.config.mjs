import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored from the official ReactBits registry (reactbits.dev/r/<Name>-TS-TW).
    // Kept byte-for-byte where possible so they can be re-pulled on updates.
    "src/components/reactbits/**",
  ]),
]);

export default eslintConfig;
