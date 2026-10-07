import type { HTMLAttributes, ReactNode } from "react";
import { Header } from "./Header.tsx";

/**
 * 外壳的页面骨架：顶栏和主面板。浮层放在面板外面，不能放进带 transform 的元素，否则 fixed 定位会失效
 */
export function ShellLayout({
  dropProps,
  children,
  panelOverlay,
  overlays,
}: {
  /** 放在最外层的拖放事件，整个窗口都能接收拖放 */
  dropProps?: HTMLAttributes<HTMLDivElement>;
  /** 面板内容 */
  children: ReactNode;
  /** 面板内绝对定位的提示，盖在面板内容上 */
  panelOverlay?: ReactNode;
  /** 页面自己的浮层（菜单、查看器等），与页面共用拖放区域 */
  overlays?: ReactNode;
}) {
  return (
    <div className="min-h-dvh" {...dropProps}>
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-5 sm:px-6 sm:py-8">
        <Header />

        <main className="relative rounded-panel bg-mantle p-3 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-surface0)_60%,transparent)] sm:p-5">
          {children}
          {panelOverlay}
        </main>
      </div>
      {overlays}
    </div>
  );
}
