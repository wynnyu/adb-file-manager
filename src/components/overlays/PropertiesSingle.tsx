import { useQuery } from "@tanstack/react-query";
import { Loader2, TriangleAlert } from "lucide-react";
import { useI18n } from "../../i18n/index.tsx";
import type { Target } from "../../lib/api.ts";
import { basename, formatDate, formatSize, parentPath } from "../../lib/format.ts";
import { kindLabel } from "../../lib/kinds.ts";
import { statQuery, usageQuery } from "../../lib/queries.ts";
import type { FileEntry, FileStat } from "../../types.ts";
import { FileIcon } from "../views/FileIcon.tsx";
import { PermissionEditor } from "./PermissionEditor.tsx";
import { Hint, Row, Section } from "./PropertiesParts.tsx";

/** 一项的属性：基本信息立即显示，其余随 stat 和递归统计陆续出现 */
export function PropertiesSingle({
  entry,
  target,
  onNavigate,
  onCopy,
  flash,
}: {
  entry: FileEntry;
  target: Target;
  onNavigate: (path: string, focus?: string | true) => void;
  onCopy: (text: string) => void;
  flash: (message: string) => void;
}) {
  const { t, lang } = useI18n();
  const stat = useQuery(statQuery(target, entry.path));
  const isDir = entry.type === "dir";
  const usage = useQuery({ ...usageQuery(target, entry.path), enabled: isDir });
  const data = stat.data;

  const size = (n: number) => (
    <>
      {formatSize(n)}
      {n >= 1024 && <Hint>{t("props.sizeBytes", { n: n.toLocaleString() })}</Hint>}
    </>
  );

  const sizeValue = !isDir ? (
    size(data?.size ?? entry.size)
  ) : usage.data ? (
    size(usage.data.size)
  ) : usage.isError ? (
    <span className="text-red">{usage.error.message}</span>
  ) : (
    <Counting />
  );

  return (
    <>
      <div className="flex w-full items-center gap-4 text-left">
        <FileIcon entry={entry} size="size-16" stroke={1.8} />
        <div className="min-w-0">
          <h2 className="text-lg font-extrabold wrap-anywhere">{entry.name}</h2>
          <p className="text-sm text-muted">{kindLabel(entry, t)}</p>
        </div>
      </div>

      <Section>
        <Row label={t("props.path")} mono onClick={() => onCopy(entry.path)} title={t("menu.copyPath")}>
          {entry.path}
        </Row>
        <Row label={t("props.size")}>{sizeValue}</Row>
        {isDir && usage.data && (
          <Row label={t("props.contents")}>
            {t("props.countJoin", {
              files: t("props.fileCount", { n: usage.data.files }),
              dirs: t("props.dirCount", { n: usage.data.dirs }),
            })}
            {usage.data.partial && (
              <span className="mt-1 flex items-center justify-end gap-1 text-xs text-peach">
                <TriangleAlert className="size-3.5 shrink-0" />
                {t("props.partial")}
              </span>
            )}
          </Row>
        )}
        <Row label={t("props.mtime")}>{formatDate(data?.mtime ?? entry.mtime, lang, t, true)}</Row>
        {data && <Row label={t("props.ctime")}>{formatDate(data.ctime, lang, t, true)}</Row>}
        {data?.link && <LinkRows stat={data} onNavigate={onNavigate} />}
        {data?.partition && (
          <Row label={t("props.partition")}>
            <span className="font-mono text-xs">
              {data.partition.mount}
              {data.partition.fsType && ` (${data.partition.fsType})`}
            </span>
            <Hint>
              {t("props.partitionFree", {
                free: formatSize(data.partition.free),
                total: formatSize(data.partition.total),
              })}
            </Hint>
          </Row>
        )}
      </Section>

      {stat.isPending && (
        <p className="flex items-center justify-center gap-2 py-2 text-sm text-muted">
          <Loader2 className="size-4 animate-spin" />
          {t("props.loading")}
        </p>
      )}
      {stat.isError && (
        <p className="w-full rounded-2xl bg-red/15 px-4 py-2 text-sm text-red wrap-anywhere">{stat.error.message}</p>
      )}

      {data && (
        <>
          {(data.inode !== undefined || data.links !== undefined || data.context) && (
            <Section>
              {data.inode !== undefined && <Row label={t("props.inode")}>{data.inode}</Row>}
              {data.links !== undefined && <Row label={t("props.links")}>{data.links}</Row>}
              {data.context && (
                <Row label={t("props.context")} mono>
                  {data.context}
                </Row>
              )}
            </Section>
          )}
          <PermissionEditor
            key={`${data.mode}:${data.uid}:${data.gid}:${data.user}:${data.group}`}
            stat={data}
            target={target}
            flash={flash}
          />
        </>
      )}
    </>
  );
}

function Counting() {
  const { t } = useI18n();
  return (
    <span className="inline-flex items-center gap-1.5 text-muted">
      <Loader2 className="size-3.5 animate-spin" />
      {t("props.counting")}
    </span>
  );
}

/** 符号链接的目标路径、目标类型和大小，以及跳转到目标的入口 */
function LinkRows({ stat, onNavigate }: { stat: FileStat; onNavigate: (path: string, focus?: string | true) => void }) {
  const { t } = useI18n();
  const link = stat.link;
  if (!link) return null;
  const isDir = link.targetType === "dir";
  const go = () => (isDir ? onNavigate(link.resolved) : onNavigate(parentPath(link.resolved), link.resolved));
  const target: FileEntry = {
    name: basename(link.resolved),
    path: link.resolved,
    type: isDir ? "dir" : "file",
    isDir,
    size: link.targetSize ?? 0,
    mtime: 0,
    atime: 0,
  };
  return (
    <>
      <Row label={t("props.linkTarget")}>
        <span className="font-mono text-xs">{link.target}</span>
        {!link.broken && (
          <button
            type="button"
            onClick={go}
            className="mt-1.5 ml-auto block rounded-full bg-accent/15 px-3 py-1 text-xs font-bold text-accent transition-colors hover:bg-accent hover:text-on-accent"
          >
            {t("props.gotoTarget")}
          </button>
        )}
      </Row>
      <Row label={t("props.linkTargetKind")}>
        {link.broken ? (
          <span className="text-peach">{t("props.linkBroken")}</span>
        ) : (
          <>
            {kindLabel(target, t)}
            {!isDir && link.targetSize !== undefined && <Hint>{formatSize(link.targetSize)}</Hint>}
          </>
        )}
      </Row>
    </>
  );
}
