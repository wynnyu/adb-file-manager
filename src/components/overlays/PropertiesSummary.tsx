import { useQueries } from "@tanstack/react-query";
import { Files, Loader2, TriangleAlert } from "lucide-react";
import { useI18n } from "../../i18n/index.tsx";
import type { Target } from "../../lib/api.ts";
import { formatSize, parentPath } from "../../lib/format.ts";
import { usageQuery } from "../../lib/queries.ts";
import type { FileEntry } from "../../types.ts";
import { Hint, Row, Section } from "./PropertiesParts.tsx";

/** 多选时只显示汇总：数量、总大小和位置；不提供权限修改 */
export function PropertiesSummary({ entries, target }: { entries: FileEntry[]; target: Target }) {
  const { t } = useI18n();
  const folders = entries.filter((e) => e.type === "dir");
  const usages = useQueries({ queries: folders.map((f) => usageQuery(target, f.path)) });

  const looseSize = entries.filter((e) => e.type !== "dir").reduce((sum, e) => sum + e.size, 0);
  const counting = usages.some((u) => u.isPending);
  const failed = usages.find((u) => u.isError);
  const total = looseSize + usages.reduce((sum, u) => sum + (u.data?.size ?? 0), 0);
  const partial = usages.some((u) => u.data?.partial);
  const dir = parentPath(entries[0].path);
  const sameDir = entries.every((e) => parentPath(e.path) === dir);

  return (
    <>
      <div className="flex w-full items-center gap-4 text-left">
        <span className="grid size-16 shrink-0 place-items-center rounded-[50%] bg-accent/15 text-accent">
          <Files className="size-7" />
        </span>
        <h2 className="text-lg font-extrabold">{t("props.itemsTitle", { n: entries.length })}</h2>
      </div>

      <Section>
        <Row label={t("props.selected")}>
          {t("props.countJoin", {
            files: t("props.fileCount", { n: entries.length - folders.length }),
            dirs: t("props.dirCount", { n: folders.length }),
          })}
        </Row>
        <Row label={t("props.size")}>
          {failed ? (
            <span className="text-red">{failed.error?.message}</span>
          ) : counting ? (
            <span className="inline-flex items-center gap-1.5 text-muted">
              <Loader2 className="size-3.5 animate-spin" />
              {t("props.counting")}
            </span>
          ) : (
            <>
              {formatSize(total)}
              {total >= 1024 && <Hint>{t("props.sizeBytes", { n: total.toLocaleString() })}</Hint>}
              {partial && (
                <span className="mt-1 flex items-center justify-end gap-1 text-xs text-peach">
                  <TriangleAlert className="size-3.5 shrink-0" />
                  {t("props.partial")}
                </span>
              )}
            </>
          )}
        </Row>
        <Row label={t("props.location")} mono={sameDir}>
          {sameDir ? dir : t("props.mixedLocation")}
        </Row>
      </Section>
    </>
  );
}
