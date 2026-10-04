import { useI18n } from "../i18n/index.tsx";

/** 确认对话框的正文：字符串原样显示，其余按 kind 排版 */
export type DialogMessage =
  | string
  | { kind: "bookmarkDelete"; preset: boolean; path: string }
  | { kind: "rootDelete"; paths: string[] }
  | { kind: "rootEnable" };

/** root 删除警告里最多列出的路径数，其余合并成“另外 n 项” */
const ROOT_DELETE_SHOWN = 4;

export function DialogMessageBody({ message }: { message: DialogMessage }) {
  const { t, rich } = useI18n();
  if (typeof message === "string") return message;
  switch (message.kind) {
    case "bookmarkDelete":
      return (
        <>
          <p>{t(message.preset ? "bookmark.deletePresetMessage" : "bookmark.deleteMessage")}</p>
          <p className="mt-2 font-mono text-xs text-muted">{message.path}</p>
        </>
      );
    case "rootDelete":
      return (
        <div className="flex flex-col items-center gap-3">
          <p>{rich("delete.root.message", { b: (s) => <b className="text-red">{s}</b> })}</p>
          <ul className="flex w-full flex-col gap-1">
            {message.paths.slice(0, ROOT_DELETE_SHOWN).map((p) => (
              <li key={p} className="truncate rounded-full bg-red/10 px-4 py-1.5 font-mono text-xs text-red">
                {p}
              </li>
            ))}
            {message.paths.length > ROOT_DELETE_SHOWN && (
              <li className="text-xs text-muted">
                {t("common.moreItems", { n: message.paths.length - ROOT_DELETE_SHOWN })}
              </li>
            )}
          </ul>
        </div>
      );
    case "rootEnable":
      return (
        <p>
          {rich("root.enable.message", {
            code: (s) => <code className="rounded-full bg-crust px-2 py-0.5 font-mono text-peach">{s}</code>,
          })}
        </p>
      );
  }
}
