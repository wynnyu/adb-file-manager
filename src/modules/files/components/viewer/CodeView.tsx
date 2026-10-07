import { selectAll } from "@codemirror/commands";
import { syntaxHighlighting } from "@codemirror/language";
import { search, searchKeymap } from "@codemirror/search";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { EditorView, highlightSpecialChars, keymap, lineNumbers } from "@codemirror/view";
import { useEffect, useRef } from "react";
import type { T } from "../../../../i18n/index.tsx";
import { useT } from "../../../../i18n/index.tsx";
import { codeHighlight, codeTheme, languageFor } from "../../lib/index.ts";

const wrapC = new Compartment();
const languageC = new Compartment();
const phrasesC = new Compartment();

const wrapExt = (wrap: boolean): Extension => (wrap ? EditorView.lineWrapping : []);

/** 搜索面板的文案，键是 CodeMirror 内置的英文原文 */
const phrasesExt = (t: T): Extension =>
  EditorState.phrases.of({
    Find: t("viewer.find"),
    next: t("viewer.findNext"),
    previous: t("viewer.findPrev"),
    all: t("viewer.findAll"),
    "match case": t("viewer.matchCase"),
    regexp: t("viewer.regexp"),
    "by word": t("viewer.wholeWord"),
    close: t("viewer.findClose"),
    "current match": t("viewer.currentMatch"),
    "on line": t("viewer.onLine"),
    "Go to line": t("viewer.gotoLine"),
    go: t("viewer.go"),
  });

/** 只读代码视图：按文件名语法高亮，显示行号，Cmd+F 或 Ctrl+F 打开搜索面板 */
export function CodeView({ text, name, wrap }: { text: string; name: string; wrap: boolean }) {
  const t = useT();
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  // 重建视图时读取最新的设置，设置变化时由下面两个 effect 单独重新配置
  const latest = useRef({ wrap, t });
  latest.current = { wrap, t };

  useEffect(() => {
    const parent = host.current;
    if (!parent) return;
    const v = new EditorView({
      parent,
      state: EditorState.create({
        doc: text,
        extensions: [
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
          // 不可编辑时内容区默认不可聚焦，加上 tabindex 后快捷键和复制仍可用
          EditorView.contentAttributes.of({ tabindex: "0", "aria-label": name, "aria-readonly": "true" }),
          lineNumbers(),
          highlightSpecialChars(),
          syntaxHighlighting(codeHighlight),
          // 放在顶部，避开右下角的换行按钮
          search({ top: true }),
          keymap.of([...searchKeymap, { key: "Mod-a", run: selectAll }]),
          codeTheme,
          wrapC.of(wrapExt(latest.current.wrap)),
          languageC.of([]),
          phrasesC.of(phrasesExt(latest.current.t)),
        ],
      }),
    });
    view.current = v;
    v.focus();

    let cancelled = false;
    languageFor(name, text)
      ?.load()
      .then((support) => {
        if (!cancelled) v.dispatch({ effects: languageC.reconfigure(support) });
      })
      .catch(() => {
        // 语言包加载失败时保持纯文本显示
      });

    return () => {
      cancelled = true;
      view.current = null;
      v.destroy();
    };
  }, [text, name]);

  useEffect(() => {
    view.current?.dispatch({ effects: wrapC.reconfigure(wrapExt(wrap)) });
  }, [wrap]);

  useEffect(() => {
    view.current?.dispatch({ effects: phrasesC.reconfigure(phrasesExt(t)) });
  }, [t]);

  return <div ref={host} className="min-h-0 flex-1" />;
}
