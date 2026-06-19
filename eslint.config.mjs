import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

const commonIgnores = ["**/dist/**", "**/.turbo/**", "**/coverage/**"];

export default tseslint.config(
  {
    ignores: commonIgnores
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
    languageOptions: {
      ecmaVersion: "latest",
      globals: {
        ...globals.node
      },
      parserOptions: {
        project: "./tsconfig.eslint.json",
        tsconfigRootDir: import.meta.dirname
      },
      sourceType: "module"
    }
  },
  {
    files: ["**/*.tsx"],
    languageOptions: {
      globals: {
        ...globals.browser
      }
    }
  },
  {
    files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
    languageOptions: {
      ecmaVersion: "latest",
      globals: {
        ...globals.node
      },
      sourceType: "module"
    }
  },
  {
    rules: {
      "no-console": "off"
    }
  }
);
