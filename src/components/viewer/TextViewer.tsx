import { useQuery } from "@tanstack/react-query";
import { FileText, Info } from "lucide-react";
import { useT } from "../../i18n/index.tsx";
import type { Target } from "../../lib/api.ts";
import { formatSize } from "../../lib/format.ts";
import { textQuery } from "../../lib/queries.ts";
import type { FileEntry } from "../../types.ts";
import { Spinner, Unsupported } from "./Unsupported.tsx";

/** 纯文本查看：仅支持 UTF-8，最多显示开头 1 MB；不是文本时提示不支持预览 */
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
    <div className="flex size-full flex-col overflow-hidden rounded-[1.75rem] bg-mantle ring-1 ring-surface0">
      {data.truncated && (
        <p className="flex shrink-0 items-center gap-2 bg-peach/15 px-5 py-2 text-sm font-semibold text-peach">
          <Info className="size-4 shrink-0" />
          {t("viewer.truncated", { size: formatSize(data.limit) })}
        </p>
      )}
      <pre className="min-h-0 flex-1 overflow-auto px-5 py-4 font-mono text-sm leading-relaxed whitespace-pre-wrap wrap-break-word text-text select-text">
        {data.text}
      </pre>
    </div>
  );
}
