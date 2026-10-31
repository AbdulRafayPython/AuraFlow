import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

/**
 * UI guard (docs/UI_REDESIGN_PLAN.md section 3): app surfaces must not use
 * gradients, glows, backdrop blur, infinite pulse animations or text below
 * 12px. Class strings are matched on string literals and template parts.
 *
 * All app code is clean as of P4, so the rule is an error everywhere except
 * the marketing / landing exemptions below. Loading skeletons use the
 * `animate-skeleton` class (index.css), which is the one allowed infinite animation.
 */
const uiGuardPatterns = [
  {
    // Gradients: bg-gradient-*, from-/via-/to- stops are only meaningful with one
    re: "\\b(?:bg-gradient-to-|bg-gradient-radial|linear-gradient\\(|radial-gradient\\(|conic-gradient\\()",
    message: "No gradients on app surfaces. Use a flat token colour.",
  },
  {
    re: "\\b(?:shadow-neon|btn-neon|btn-primary-gradient|btn-glass|shadow-\\[0_0_|shadow-\\[var\\(--theme-glow|theme-glow|theme-pulse-glow|theme-breathe-glow)",
    message: "No glow / neon effects. Shadows are for popovers only (shadow-popover).",
  },
  {
    re: "\\b(?:backdrop-blur(?:-[a-z0-9]+)?|(?<![a-z-])blur-(?:sm|md|lg|xl|2xl|3xl|\\[))",
    message: "No blur on app surfaces.",
  },
  {
    re: "\\banimate-(?:pulse|ping|bounce)\\b",
    message: "No infinite animations outside skeletons and spinners. Use <Skeleton> or animate-spin.",
  },
  {
    re: "\\btext-\\[(?:[0-9]|1[01])(?:\\.\\d+)?px\\]",
    message: "Text must be at least 12px. Use text-xs (12px) or larger.",
  },
];

const uiGuardRules = (level) => ({
  "no-restricted-syntax": [
    level,
    ...uiGuardPatterns.flatMap(({ re, message }) => [
      { selector: `Literal[value=/${re}/]`, message },
      { selector: `TemplateElement[value.raw=/${re}/]`, message },
    ]),
  ],
});

// Marketing / landing may keep one calm hero treatment.
const uiGuardExempt = ["src/components/marketing/**", "src/pages/LandingPage.tsx", "src/styles/**"];

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  // Every app surface: violations fail lint. (Landing / marketing are exempt above.)
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: uiGuardExempt,
    rules: uiGuardRules("error"),
  },
);
