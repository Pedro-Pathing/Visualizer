import type { HighlighterCore } from "shiki/core";

export type CodeLanguage = "java" | "kotlin" | "text";

let highlighter: Promise<HighlighterCore> | null = null;

/** Loaded on first use, so Shiki stays out of the startup bundle. */
async function loadHighlighter(): Promise<HighlighterCore> {
  const [{ createHighlighterCore }, { createJavaScriptRegexEngine }] =
    await Promise.all([
      import("shiki/core"),
      import("shiki/engine/javascript"),
    ]);
  return createHighlighterCore({
    themes: [
      import("shiki/themes/github-light.mjs"),
      import("shiki/themes/github-dark.mjs"),
    ],
    langs: [import("shiki/langs/java.mjs"), import("shiki/langs/kotlin.mjs")],
    engine: createJavaScriptRegexEngine(),
  });
}

/**
 * Highlighted HTML carrying both themes as CSS variables; `app.css` picks
 * the one matching the page theme.
 */
export async function highlight(
  code: string,
  lang: CodeLanguage,
): Promise<string> {
  highlighter ??= loadHighlighter();
  const shiki = await highlighter;
  return shiki.codeToHtml(code, {
    lang,
    themes: { light: "github-light", dark: "github-dark" },
    defaultColor: false,
  });
}
