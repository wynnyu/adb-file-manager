import { useQuery } from "@tanstack/react-query";
import { BookOpenText, FileText, Info, WrapText } from "lucide-react";
import { lazy, Suspense } from "react";
import { useT } from "../../i18n/index.tsx";
import type { Target } from "../../lib/index.ts";
import { formatSize, isMarkdown, textQuery, usePref } from "../../lib/index.ts";
import type { FileEntry } from "../../types.ts";
import { IconButton } from "../ui.tsx";
import { Spinner, Unsupported } from "./Unsupported.tsx";

// CodeMirror 体积较大，第一次打开文本时才下载
const CodeView = lazy(() => import("./CodeView.tsx").then((m) => ({ default: m.CodeView })));
// Markdown 渲染链路同样按需加载，只在打开 .md 的预览时下载
const MarkdownView = lazy(() => import("./MarkdownView.tsx").then((m) => ({ default: m.MarkdownView })));

/** 文本查看：仅支持 UTF-8，最多显示开头 1 MB；不是文本时提示不支持预览。经 CodeView 只读显示，按文件名语法高亮。Markdown 文件默认显示排版后的预览，可切回源码。自动换行和预览开关的设置在文件之间保持 */
export function TextViewer({
  target,
  entry,
  onDownload,
}: {
  target: Target;
  entry: FileEntry;
  onDownload: () => void;
}) {
  const t = useT();
  const { data, error } = useQuery(textQuery(target, entry.path));
  const [wrap, setWrap] = usePref("afm.textWrap", true);
  const md = isMarkdown(entry.name);
  const [preview, setPreview] = usePref("afm.markdownPreview", true);

  if (error) return <Unsupported entry={entry} text={error.message} onDownload={onDownload} />;
  if (!data) return <Spinner />;
  if (data.kind === "binary")
    return <Unsupported entry={entry} text={t("viewer.unsupported")} onDownload={onDownload} />;
  if (!data.text) {
    return (
      <div className="grid size-full place-items-center">
        <div className="flex flex-col items-center gap-3 text-subtext0">
          <span className="grid size-16 place-items-center rounded-[50%] bg-surface0">
            <FileText className="size-7" />
          </span>
          <p className="text-sm font-semibold">{t("viewer.empty")}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="relative flex size-full flex-col overflow-hidden rounded-[1.75rem] bg-mantle ring-1 ring-surface0">
      {data.truncated && (
        <p className="flex shrink-0 items-center gap-2 bg-peach/15 px-5 py-2 text-sm font-semibold text-peach">
          <Info className="size-4 shrink-0" />
          {t("viewer.truncated", { size: formatSize(data.limit) })}
        </p>
      )}
      <Suspense fallback={<Spinner />}>
        {md && preview ? (
          <MarkdownView text={data.text} entry={entry} target={target} wrap={wrap} />
        ) : (
          <CodeView text={data.text} name={entry.name} wrap={wrap} />
        )}
      </Suspense>
      <div className="absolute right-4 bottom-4 flex flex-col gap-2">
        {md && (
          <IconButton
            tone={preview ? "accent" : "default"}
            title={t("viewer.markdownPreview")}
            aria-pressed={preview}
            onClick={() => setPreview((v) => !v)}
            className="shadow-lg"
          >
            <BookOpenText className="size-5" />
          </IconButton>
        )}
        <IconButton
          tone={wrap ? "accent" : "default"}
          title={t("viewer.wrap")}
          aria-pressed={wrap}
          onClick={() => setWrap((v) => !v)}
          className="shadow-lg"
        >
          <WrapText className="size-5" />
        </IconButton>
      </div>
    </div>
  );
}
