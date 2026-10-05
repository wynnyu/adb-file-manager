/**
 * root 模式下的标签页图标：图形同 index.html 中的默认图标，底色换成红色。
 * favicon 取不到主题变量，颜色固定为 Mocha 的 Red，与默认图标的写法一致
 */
export const ROOT_ICON = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#f38ba8"/><rect x="11" y="7" width="10" height="18" rx="3" fill="#1e1e2e"/></svg>',
)}`;

/** index.html 中的默认图标，第一次切换时记下 */
let defaultIcon: string | null = null;

/** 按是否处于 root 模式切换标签页图标；页面没有 icon 链接时不处理 */
export function setRootFavicon(root: boolean) {
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) return;
  defaultIcon ??= link.getAttribute("href");
  const href = root ? ROOT_ICON : defaultIcon;
  if (href) link.setAttribute("href", href);
}
