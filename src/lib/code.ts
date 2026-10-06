import { HighlightStyle, LanguageDescription } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

/** Android 上常见、但 language-data 没有收录的扩展名，值是语言名或别名 */
const EXTRA_EXTENSIONS: Record<string, string> = {
  prop: "properties",
  conf: "properties",
  cfg: "properties",
  rc: "shell",
  kts: "kotlin",
};

/** 按文件名识别语言；没有扩展名时再看首行的 shebang。识别不了时返回 null，按纯文本显示 */
export function languageFor(name: string, text: string): LanguageDescription | null {
  const byName = LanguageDescription.matchFilename(languages, name);
  if (byName) return byName;

  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "";
  const extra = EXTRA_EXTENSIONS[ext];
  if (extra) return LanguageDescription.matchLanguageName(languages, extra);

  const first = text.slice(0, text.indexOf("\n") === -1 ? 200 : text.indexOf("\n"));
  if (!first.startsWith("#!")) return null;
  if (/python/.test(first)) return LanguageDescription.matchLanguageName(languages, "python", false);
  if (/sh\b|bash/.test(first)) return LanguageDescription.matchLanguageName(languages, "shell", false);
  return null;
}

/** 编辑器外观，颜色全部取主题变量，随 data-flavor 和 data-accent 自动变化 */
export const codeTheme = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "transparent",
    color: "var(--color-text)",
    fontSize: "0.875rem",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "var(--font-mono)",
    lineHeight: "1.625",
    overflow: "auto",
  },
  // 底部多留出右下角换行按钮的高度
  ".cm-content": { padding: "1rem 0 4.5rem" },
  ".cm-line": { padding: "0 1.25rem 0 0.5rem" },
  ".cm-gutters": {
    backgroundColor: "var(--color-mantle)",
    color: "var(--color-muted)",
    border: "none",
  },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 0.5rem 0 1.25rem" },
  ".cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
    background: "color-mix(in srgb, var(--color-accent) 30%, transparent)",
  },
  ".cm-searchMatch": {
    backgroundColor: "color-mix(in srgb, var(--color-peach) 30%, transparent)",
  },
  ".cm-searchMatch.cm-searchMatch-selected": {
    backgroundColor: "color-mix(in srgb, var(--color-accent) 45%, transparent)",
  },
  ".cm-panels": {
    backgroundColor: "var(--color-base)",
    color: "var(--color-text)",
    borderBottom: "1px solid var(--color-surface0)",
  },
  ".cm-search": {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "0.375rem",
    padding: "0.5rem 1.25rem",
    fontSize: "0.8125rem",
  },
  ".cm-search br": { display: "none" },
  ".cm-search input, .cm-search button": {
    margin: "0",
    border: "none",
    borderRadius: "0.75rem",
    backgroundColor: "var(--color-surface0)",
    color: "var(--color-text)",
    fontFamily: "inherit",
    fontSize: "inherit",
  },
  ".cm-search input": { padding: "0.375rem 0.75rem" },
  ".cm-search button": {
    padding: "0.375rem 0.75rem",
    backgroundImage: "none",
    cursor: "pointer",
  },
  ".cm-search button:hover": { backgroundColor: "var(--color-surface1)" },
  ".cm-search input:focus-visible, .cm-search button:focus-visible": {
    outline: "2px solid var(--color-accent)",
    outlineOffset: "1px",
  },
  ".cm-search label": {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    color: "var(--color-subtext0)",
  },
  ".cm-search input[type=checkbox]": { accentColor: "var(--color-accent)" },
  // 自带的关闭按钮文字是符号字符，改用 Esc 关闭
  ".cm-search [name=close]": { display: "none" },
});

/** 语法高亮配色，参照 Catppuccin 风格指南 */
export const codeHighlight = HighlightStyle.define([
  {
    tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.definitionKeyword, t.moduleKeyword, t.modifier, t.self],
    color: "var(--color-mauve)",
  },
  { tag: [t.string, t.character, t.inserted, t.special(t.string)], color: "var(--color-green)" },
  { tag: [t.regexp, t.escape], color: "var(--color-pink)" },
  { tag: [t.number, t.bool, t.null, t.atom, t.constant(t.variableName)], color: "var(--color-peach)" },
  {
    tag: [t.comment, t.lineComment, t.blockComment, t.docComment, t.meta],
    color: "var(--color-muted)",
    fontStyle: "italic",
  },
  {
    tag: [t.function(t.variableName), t.function(t.propertyName), t.tagName, t.url, t.link],
    color: "var(--color-blue)",
  },
  { tag: [t.typeName, t.className, t.namespace, t.attributeName], color: "var(--color-yellow)" },
  { tag: [t.propertyName, t.labelName], color: "var(--color-lavender)" },
  { tag: t.heading, color: "var(--color-red)", fontWeight: "bold" },
  { tag: t.strong, fontWeight: "bold" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: [t.deleted, t.invalid], color: "var(--color-red)" },
  { tag: [t.operator, t.punctuation, t.bracket], color: "var(--color-subtext1)" },
]);
