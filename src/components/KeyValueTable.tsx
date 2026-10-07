import { Check, Copy, Loader2, Pencil, SearchX, Trash2, TriangleAlert } from "lucide-react";
import { motion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useT } from "../i18n/index.tsx";
import { IconButton, Placeholder, spring } from "./ui.tsx";

/** 键值表格的一行；调用方的行类型可以带更多字段 */
export interface KeyValueRow {
  key: string;
  value: string;
}

/** 超过这个行数不再做布局动画，避免上千行同时测量 */
const LAYOUT_ANIMATION_MAX = 200;

/**
 * 通用键值表格：键名等宽，值可换行，每行有拷贝键名、拷贝值、修改（可选）和删除（可选）按钮。
 * 行的 key 用键名，所以 rows 里的键名必须唯一
 */
export function KeyValueTable<T extends KeyValueRow>({
  rows,
  loading,
  loadingText,
  error,
  emptyText,
  canEdit,
  onEdit,
  onDelete,
  badge,
}: {
  rows: T[];
  /** 首次加载中，还没有数据 */
  loading: boolean;
  loadingText: string;
  error: string | null;
  emptyText: string;
  /** 该行是否显示修改按钮 */
  canEdit: (row: T) => boolean;
  onEdit: (row: T) => void;
  /** 缺省时不显示删除按钮；有值时每行都显示 */
  onDelete?: (row: T) => void;
  /** 显示在键名后的标记 */
  badge?: (row: T) => ReactNode;
}) {
  const t = useT();
  const animateLayout = rows.length <= LAYOUT_ANIMATION_MAX;
  /** 刚拷贝过的按钮，短暂显示对勾 */
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  function copy(id: string, text: string) {
    navigator.clipboard.writeText(text).then(
      () => {
        setCopied(id);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(null), 1500);
      },
      () => {
        // 剪贴板不可用时保持原状
      },
    );
  }

  if (error) return <Placeholder icon={<TriangleAlert className="size-7" />} text={error} tone="bg-red/15 text-red" />;
  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-muted" role="status">
        <Loader2 className="size-7 animate-spin" />
        <span className="text-sm">{loadingText}</span>
      </div>
    );
  }
  if (rows.length === 0) return <Placeholder icon={<SearchX className="size-7" />} text={emptyText} />;

  return (
    <ul className="flex flex-col gap-1">
      {rows.map((row) => {
        const copyButton = (what: "key" | "value", title: string) => {
          const id = `${row.key}\0${what}`;
          return (
            <IconButton
              tone="ghost"
              className="size-8"
              title={copied === id ? t("kv.copied") : title}
              onClick={() => copy(id, what === "key" ? row.key : row.value)}
            >
              {copied === id ? <Check className="size-4" /> : <Copy className="size-4" />}
            </IconButton>
          );
        };
        return (
          <motion.li
            key={row.key}
            layout={animateLayout ? "position" : false}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.12 } }}
            transition={spring}
            className="group flex items-start gap-3 rounded-3xl px-4 py-2 even:bg-base/60 hover:bg-surface0/70"
          >
            <div className="min-w-0 flex-1 sm:grid sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-semibold break-all">{row.key}</span>
                {badge?.(row)}
              </div>
              {row.value === "" ? (
                <span className="text-sm text-muted italic">{t("kv.emptyValue")}</span>
              ) : (
                <span className="text-sm whitespace-pre-wrap text-subtext1 break-all">{row.value}</span>
              )}
            </div>
            <div className="flex shrink-0 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
              {copyButton("key", t("kv.copyKey"))}
              {copyButton("value", t("kv.copyValue", { key: row.key }))}
              {canEdit(row) && (
                <IconButton
                  tone="ghost"
                  className="size-8"
                  title={t("kv.edit", { key: row.key })}
                  onClick={() => onEdit(row)}
                >
                  <Pencil className="size-4" />
                </IconButton>
              )}
              {onDelete && (
                <IconButton
                  tone="ghost-danger"
                  className="size-8"
                  title={t("kv.delete", { key: row.key })}
                  onClick={() => onDelete(row)}
                >
                  <Trash2 className="size-4" />
                </IconButton>
              )}
            </div>
          </motion.li>
        );
      })}
    </ul>
  );
}
