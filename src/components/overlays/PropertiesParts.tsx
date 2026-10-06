import type { ReactNode } from "react";

/** 属性页里一组带标题的信息 */
export function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="w-full text-left">
      {title && <h3 className="mb-1 px-1 text-xs font-bold tracking-wide text-muted">{title}</h3>}
      <dl className="divide-y divide-surface0 rounded-3xl bg-base px-4">{children}</dl>
    </section>
  );
}

/** 一行信息：左侧名称，右侧取值；给出 onClick 时取值可点击（用于拷贝） */
export function Row({
  label,
  children,
  mono = false,
  onClick,
  title,
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
  onClick?: () => void;
  /** 取值可点击时的提示 */
  title?: string;
}) {
  const style = `min-w-0 text-right text-sm wrap-anywhere ${mono ? "font-mono text-xs" : ""}`;
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-sm text-muted">{label}</dt>
      <dd className={style}>
        {onClick ? (
          <button
            type="button"
            title={title}
            onClick={onClick}
            className="rounded-lg text-right transition-colors hover:text-accent"
          >
            {children}
          </button>
        ) : (
          children
        )}
      </dd>
    </div>
  );
}

/** 取值下方的补充说明 */
export function Hint({ children }: { children: ReactNode }) {
  return <span className="block text-xs text-muted">{children}</span>;
}
