import js from "@eslint/js";
import ts from "typescript-eslint";
import svelte from "eslint-plugin-svelte";
import prettier from "eslint-config-prettier";
import globals from "globals";
import svelteConfig from "./svelte.config.js";

export default ts.config(
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs.recommended,
  prettier,
  ...svelte.configs.prettier,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    files: ["**/*.svelte", "**/*.svelte.ts", "**/*.svelte.js"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        extraFileExtensions: [".svelte"],
        parser: ts.parser,
        svelteConfig,
      },
    },
  },
  {
    files: ["**/*.svelte"],
    rules: {
      // Misreads `prop = $bindable(default)` in `$props()` destructuring as a
      // dead assignment. The default is part of the prop contract, not dead code.
      "no-useless-assignment": "off",
    },
  },
  {
    rules: {
      // The codebase leans on `any` for Two.js scene objects and parsed
      // project JSON; surface those as warnings rather than errors.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // The portable core: plain TypeScript that must run outside this app.
    files: [
      "src/io/**/*.ts",
      "src/model/**/*.ts",
      "src/sim/**/*.ts",
      "src/lib/codegen/**/*.ts",
      "src/lib/scene/stroke.ts",
      "src/utils/color.ts",
      "src/utils/filename.ts",
      "src/utils/geometry.ts",
      "src/utils/headingInterpolation.ts",
      "src/utils/ids.ts",
      "src/utils/math.ts",
      "src/utils/normalize.ts",
      "src/utils/pathTraversal.ts",
      "src/utils/shapes.ts",
      "src/utils/timeCalculator.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["svelte", "svelte/*", "**/*.svelte", "$lib", "$lib/*"],
              message: "The core must not depend on Svelte.",
            },
            {
              group: ["two.js", "two.js/*", "d3", "d3-*", "hotkeys-js"],
              message:
                "The core must not depend on rendering or input libraries.",
            },
            {
              group: ["**/stores", "**/lib/toast", "**/utils/perf"],
              message:
                "The core must not depend on app state or instrumentation.",
            },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        ...[
          "window",
          "document",
          "localStorage",
          "sessionStorage",
          "navigator",
        ].map((name) => ({
          name,
          message: "The core must not touch the DOM or browser storage.",
        })),
        ...["alert", "confirm", "prompt"].map((name) => ({
          name,
          message: "The core must not show UI.",
        })),
      ],
    },
  },
  {
    ignores: [
      "dist/",
      "out/",
      "public/",
      "node_modules/",
      "*.config.js",
      "*.config.ts",
      "vite.config.d.ts",
    ],
  },
);
