import type { LanguageDescription, LanguageSupport } from "@codemirror/language";
import { Check, Copy, CornerLeftUp } from "lucide-react";
import {
  type AnchorHTMLAttributes,
  createContext,
  type ImgHTMLAttributes,
  isValidElement,
  type MouseEvent,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useT } from "../../i18n/index.tsx";
import { api, highlightLines, languageForFence, resolveLink, type Target, type Token } from "../../lib/index.ts";
import { IconButton } from "../ui.tsx";

/** 代码块是否自动换行。经 context 传递而不是写进 components：components 变化会让整棵渲染树重新挂载，滚动位置随之丢失 */
export const WrapContext = createContext(true);

/** 取出 React 子节点里的纯文本 */
function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

/** 按行的片段转成带类名的 span，行之间补回换行；key 用累加的序号 */
function renderTokens(lines: Token[][]): ReactNode[] {
  const nodes: ReactNode[] = [];
  let key = 0;
  lines.forEach((line, i) => {
    if (i > 0) nodes.push("\n");
    for (const token of line) {
      nodes.push(
        token.cls ? (
          <span key={key++} className={token.cls}>
            {token.text}
          </span>
        ) : (
          token.text
        ),
      );
    }
  });
  return nodes;
}

/** 围栏代码块：顶栏显示语言并提供拷贝，正文按语言高亮，语言包未加载时先显示纯文本 */
export function CodeBlock({ children }: { children: ReactNode }) {
  const t = useT();
  const wrap = useContext(WrapContext);
  const child = isValidElement<{ className?: string; children?: ReactNode }>(children) ? children : null;
  const lang = /language-(\S+)/.exec(child?.props.className ?? "")?.[1] ?? "";
  // 围栏内容末尾自带一个换行，去掉以免多出一行空行
  const code = textOf(child ? child.props.children : children).replace(/\n$/, "");
  const desc = useMemo(() => (lang ? languageForFence(lang) : null), [lang]);

  const [loaded, setLoaded] = useState<{ desc: LanguageDescription; support: LanguageSupport } | null>(null);
  useEffect(() => {
    if (!desc || desc.support) return;
    let cancelled = false;
    desc
      .load()
      .then((support) => {
        if (!cancelled) setLoaded({ desc, support });
      })
      .catch(() => {
        // 语言包加载失败时保持纯文本显示
      });
    return () => {
      cancelled = true;
    };
  }, [desc]);
  const support = desc?.support ?? (loaded?.desc === desc ? loaded?.support : undefined);
  const body = useMemo(() => (support ? renderTokens(highlightLines(code, support.language)) : code), [support, code]);

  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = () => {
    navigator.clipboard
      .writeText(code)
      .then(() => {
        setCopied(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {
        // 剪贴板不可用时保持原状
      });
  };

  return (
    <div className="my-4 overflow-hidden rounded-2xl bg-base ring-1 ring-surface0">
      <div className="flex items-center justify-between gap-2 border-b border-surface0 py-1 pr-2 pl-4">
        <span className="text-xs font-semibold text-muted">{lang}</span>
        <IconButton
          tone="ghost"
          className="size-8"
          title={copied ? t("viewer.copied") : t("viewer.copyCode")}
          onClick={copy}
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        </IconButton>
      </div>
      <pre
        className={`px-4 py-3 font-mono text-sm leading-relaxed ${
          wrap ? "whitespace-pre-wrap break-words" : "overflow-x-auto whitespace-pre"
        }`}
      >
        <code>{body}</code>
      </pre>
    </div>
  );
}

/** 任务列表的勾选标记，只读，外观同对话框里的圆形勾选 */
export function TaskCheck({ checked }: { checked: boolean }) {
  return (
    // biome-ignore lint/a11y/useFocusableInteractive: 只读标记，不参与键盘操作
    // biome-ignore lint/a11y/useSemanticElements: 原生 checkbox 无法套用圆形外观，且这里只读
    <span
      role="checkbox"
      aria-checked={checked}
      aria-readonly="true"
      className={`mt-1.5 grid size-[1.125rem] shrink-0 place-items-center rounded-[50%] ring-2 ${
        checked ? "bg-accent text-on-accent ring-accent" : "ring-surface2"
      }`}
    >
      {checked && <Check className="size-3" strokeWidth={3} />}
    </span>
  );
}

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { "data-footnote-backref"?: string };

/** 链接：外部在新标签页打开，锚点在文档内滚动，指向设备上其他文件的相对链接不可点击 */
export function MdLink({
  dir,
  onAnchor,
  href = "",
  children,
  ...rest
}: LinkProps & { dir: string; onAnchor: (id: string) => void }) {
  const link = resolveLink(dir, href);
  if (link.kind === "device") {
    return (
      <span
        title={link.path}
        className="cursor-default font-semibold text-subtext1 underline decoration-dashed underline-offset-4"
      >
        {children}
      </span>
    );
  }
  if (link.kind === "anchor") {
    const onClick = (e: MouseEvent) => {
      e.preventDefault();
      onAnchor(link.id);
    };
    return (
      <a {...rest} href={href} onClick={onClick}>
        {"data-footnote-backref" in rest ? <CornerLeftUp className="inline size-3.5" /> : children}
      </a>
    );
  }
  return (
    <a {...rest} href={link.href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

/** 图片：相对路径按 md 所在目录解析，经预览接口从设备读取 */
export function MdImage({
  target,
  dir,
  src = "",
  alt,
  width,
  height,
}: ImgHTMLAttributes<HTMLImageElement> & { target: Target; dir: string }) {
  const link = typeof src === "string" ? resolveLink(dir, src) : null;
  const url = link?.kind === "device" ? api.previewUrl(target, link.path) : src;
  return (
    <img
      src={url}
      alt={alt}
      width={width}
      height={height}
      loading="lazy"
      className="inline-block h-auto max-w-full rounded-xl align-middle"
    />
  );
}
