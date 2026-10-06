import { type ComponentProps, useEffect, useMemo, useRef } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { useT } from "../../i18n/index.tsx";
import type { Target } from "../../lib/api.ts";
import { codeHighlightCss } from "../../lib/code.ts";
import { SANITIZE_SCHEMA, slugger } from "../../lib/markdown.ts";
import type { FileEntry } from "../../types.ts";
import { CodeBlock, MdImage, MdLink, TaskCheck, WrapContext } from "./MarkdownParts.tsx";

type RehypePlugins = NonNullable<ComponentProps<typeof ReactMarkdown>["rehypePlugins"]>;

// 先解析原始 HTML，再净化，顺序不能颠倒
const REHYPE_PLUGINS: RehypePlugins = [rehypeRaw, [rehypeSanitize, SANITIZE_SCHEMA]];

const HEADING = "scroll-mt-6 font-bold";
const LINK =
  "font-semibold text-accent underline decoration-accent/40 underline-offset-4 transition-colors hover:decoration-accent";

/** 渲染后的 Markdown 预览。HTML 经净化后显示；代码块复用源码视图的语言识别和配色 */
export function MarkdownView({
  text,
  entry,
  target,
  wrap,
}: {
  text: string;
  entry: FileEntry;
  target: Target;
  wrap: boolean;
}) {
  const t = useT();
  const root = useRef<HTMLDivElement>(null);
  // 方向键、PageUp、空格直接滚动正文；左右方向键仍由查看器切换文件
  useEffect(() => root.current?.focus(), []);
  const dir = entry.path.slice(0, entry.path.lastIndexOf("/")) || "/";

  const components = useMemo<Components>(() => {
    /** 滚动到锚点：先找脚注和 HTML 里的 id（净化时加了 user-content- 前缀），再按标题文字的 slug 匹配 */
    const scrollTo = (id: string) => {
      const box = root.current;
      if (!box) return;
      let el = box.querySelector<HTMLElement>(`[id="user-content-${CSS.escape(id)}"]`);
      if (!el) {
        const slug = slugger();
        el =
          Array.from(box.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6")).find(
            (h) => slug(h.textContent ?? "") === id.toLowerCase(),
          ) ?? null;
      }
      el?.scrollIntoView({ block: "start" });
    };

    return {
      h1: ({ node: _, ...p }) => (
        <h1 {...p} className={`${HEADING} mt-10 mb-4 border-b border-surface0 pb-2 text-3xl tracking-tight`} />
      ),
      h2: ({ node: _, className, ...p }) => (
        <h2
          {...p}
          className={
            className === "sr-only"
              ? "sr-only"
              : `${HEADING} mt-8 mb-3 border-b border-surface0 pb-2 text-2xl tracking-tight`
          }
        />
      ),
      h3: ({ node: _, ...p }) => <h3 {...p} className={`${HEADING} mt-6 mb-2 text-xl`} />,
      h4: ({ node: _, ...p }) => <h4 {...p} className={`${HEADING} mt-6 mb-2 text-lg`} />,
      h5: ({ node: _, ...p }) => <h5 {...p} className={`${HEADING} mt-6 mb-2 text-base`} />,
      h6: ({ node: _, ...p }) => <h6 {...p} className={`${HEADING} mt-6 mb-2 text-sm text-subtext0`} />,
      p: ({ node: _, ...p }) => <p {...p} className="my-4" />,
      a: ({ node: _, ...p }) => <MdLink {...p} dir={dir} onAnchor={scrollTo} className={LINK} />,
      strong: ({ node: _, ...p }) => <strong {...p} className="font-bold" />,
      em: ({ node: _, ...p }) => <em {...p} className="italic" />,
      del: ({ node: _, ...p }) => <del {...p} className="text-subtext0 line-through" />,
      ul: ({ node: _, className, ...p }) => (
        <ul
          {...p}
          className={`my-4 space-y-1 [li>&]:my-1 [li>&]:basis-full ${
            className?.includes("contains-task-list") ? "pl-0 [li>&]:pl-7" : "list-disc pl-6 marker:text-muted"
          }`}
        />
      ),
      ol: ({ node: _, className, ...p }) => (
        <ol
          {...p}
          className={`my-4 space-y-1 [li>&]:my-1 [li>&]:basis-full ${
            className?.includes("contains-task-list")
              ? "pl-0"
              : "list-decimal pl-6 marker:text-muted marker:tabular-nums"
          }`}
        />
      ),
      li: ({ node: _, className, ...p }) => (
        <li
          {...p}
          className={className?.includes("task-list-item") ? "flex flex-wrap items-start gap-x-2" : undefined}
        />
      ),
      input: ({ node: _, type, checked }) => (type === "checkbox" ? <TaskCheck checked={!!checked} /> : null),
      blockquote: ({ node: _, ...p }) => (
        <blockquote
          {...p}
          className="my-4 rounded-r-2xl border-l-4 border-accent/50 bg-surface0/40 px-4 py-2 text-subtext1"
        />
      ),
      code: ({ node: _, ...p }) => (
        <code {...p} className="rounded-lg bg-surface0 px-1.5 py-0.5 font-mono text-[0.85em]" />
      ),
      pre: ({ node: _, children }) => <CodeBlock>{children}</CodeBlock>,
      table: ({ node: _, ...p }) => (
        <div className="my-4 overflow-x-auto rounded-2xl ring-1 ring-surface0">
          <table {...p} className="w-full border-collapse text-sm" />
        </div>
      ),
      thead: ({ node: _, ...p }) => <thead {...p} className="bg-surface0/60" />,
      tr: ({ node: _, ...p }) => <tr {...p} className="transition-colors hover:bg-surface0/30" />,
      th: ({ node: _, ...p }) => <th {...p} className="px-4 py-2 text-left font-bold text-subtext1" />,
      td: ({ node: _, ...p }) => <td {...p} className="border-t border-surface0 px-4 py-2" />,
      hr: ({ node: _, ...p }) => <hr {...p} className="my-8 h-px border-0 bg-surface0" />,
      img: ({ node: _, ...p }) => <MdImage {...p} target={target} dir={dir} />,
      details: ({ node: _, ...p }) => <details {...p} className="my-4 rounded-2xl bg-surface0/40 px-4 py-2" />,
      summary: ({ node: _, ...p }) => <summary {...p} className="cursor-pointer font-semibold" />,
      section: ({ node: _, className, ...p }) => (
        <section
          {...p}
          className={
            className === "footnotes" ? "mt-10 border-t border-surface0 pt-4 text-sm text-subtext0" : undefined
          }
        />
      ),
      sup: ({ node: _, ...p }) => <sup {...p} className="text-xs" />,
    };
  }, [target, dir]);

  return (
    // biome-ignore lint/a11y/noNoninteractiveTabindex: 可聚焦后方向键、PageUp、空格才能滚动正文
    <div ref={root} tabIndex={0} className="min-h-0 flex-1 overflow-auto outline-none">
      <style href="afm-code-highlight" precedence="default">
        {codeHighlightCss}
      </style>
      <article
        aria-label={entry.name}
        className="mx-auto max-w-3xl px-6 pt-8 pb-28 text-[0.9375rem] leading-7 break-words text-text [&>:first-child]:mt-0"
      >
        <WrapContext value={wrap}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={REHYPE_PLUGINS}
            remarkRehypeOptions={{
              clobberPrefix: "",
              footnoteLabel: t("viewer.footnotes"),
              footnoteBackLabel: t("viewer.footnoteBack"),
            }}
            components={components}
          >
            {text}
          </ReactMarkdown>
        </WrapContext>
      </article>
    </div>
  );
}
