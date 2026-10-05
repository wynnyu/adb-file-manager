import { Shrink } from "lucide-react";
import { motion } from "motion/react";
import { type PointerEvent, useCallback, useEffect, useRef, useState } from "react";
import { useT } from "../../i18n/index.tsx";
import type { FileEntry } from "../../types.ts";
import { IconButton, spring } from "../ui.tsx";
import { Spinner, Unsupported } from "./Unsupported.tsx";

const MIN_SCALE = 0.1;
const MAX_SCALE = 10;

/** 缩放和平移；x、y 是图片中心相对容器中心的偏移，单位 px */
interface View {
  scale: number;
  x: number;
  y: number;
}

interface Size {
  w: number;
  h: number;
}

/** Safari 的触控板捏合手势事件，TypeScript 自带的 DOM 类型里没有 */
interface GestureEvent extends UIEvent {
  scale: number;
  clientX: number;
  clientY: number;
}

const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

/** 适合窗口的缩放比例：大图缩小到完整显示，小图保持原大 */
function fitScale(img: Size, box: Size) {
  if (!img.w || !img.h || !box.w || !box.h) return 1;
  return Math.min(1, box.w / img.w, box.h / img.h);
}

/** 限制平移范围：图片小于容器的方向居中，大于容器的方向边缘不离开容器 */
function clampView(v: View, img: Size, box: Size): View {
  const limit = (len: number, room: number, at: number) => {
    const max = Math.max(0, (len * v.scale - room) / 2);
    return Math.min(max, Math.max(-max, at));
  };
  return { scale: v.scale, x: limit(img.w, box.w, v.x), y: limit(img.h, box.h, v.y) };
}

/**
 * 图片查看：初始适合窗口，Ctrl+滚轮或触控板捏合以光标为中心缩放，放大后可拖动，
 * 双击在适合窗口和 100% 之间切换
 */
export function ImageViewer({ entry, src, onDownload }: { entry: FileEntry; src: string; onDownload: () => void }) {
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  const [img, setImg] = useState<Size | null>(null);
  const [boxSize, setBoxSize] = useState<Size>({ w: 0, h: 0 });
  const [error, setError] = useState(false);
  /** null 表示适合窗口，窗口大小变化时跟着重新计算 */
  const [view, setView] = useState<View | null>(null);
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const natural = img ?? { w: 0, h: 0 };
  const fit = fitScale(natural, boxSize);
  const current = view ?? { scale: fit, x: 0, y: 0 };
  // 事件监听只注册一次，通过 ref 读取最新的尺寸
  const latest = useRef({ natural, boxSize, current });
  latest.current = { natural, boxSize, current };

  useEffect(() => {
    const measure = () => {
      const el = box.current;
      if (el) setBoxSize({ w: el.clientWidth, h: el.clientHeight });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  /** 缩放到 scale，保持 (clientX, clientY) 下的那一点不动 */
  const zoomAt = useCallback((scale: number, clientX: number, clientY: number) => {
    const el = box.current;
    if (!el) return;
    const { natural, boxSize, current } = latest.current;
    const rect = el.getBoundingClientRect();
    const px = clientX - rect.left - rect.width / 2;
    const py = clientY - rect.top - rect.height / 2;
    const s = clampScale(scale);
    const k = s / current.scale;
    setView(clampView({ scale: s, x: px - (px - current.x) * k, y: py - (py - current.y) * k }, natural, boxSize));
  }, []);

  // React 的 onWheel 是被动监听，无法阻止浏览器缩放整个页面，这里原生注册
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { natural, boxSize, current } = latest.current;
      // 按行滚动的鼠标（Firefox）换算成像素
      const unit = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : 1;
      if (e.ctrlKey) {
        // macOS 上 Chrome 和 Firefox 的触控板捏合也是带 ctrlKey 的 wheel 事件
        const delta = Math.min(50, Math.max(-50, e.deltaY * unit));
        zoomAt(current.scale * 2 ** (-delta / 100), e.clientX, e.clientY);
      } else {
        const moved = { ...current, x: current.x - e.deltaX * unit, y: current.y - e.deltaY * unit };
        setView(clampView(moved, natural, boxSize));
      }
    };
    // Safari 的捏合手势：scale 是相对手势开始时的倍数
    let start = 1;
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      start = latest.current.current.scale;
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const g = e as GestureEvent;
      zoomAt(start * g.scale, g.clientX, g.clientY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("gesturestart", onGestureStart);
    el.addEventListener("gesturechange", onGestureChange);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("gesturestart", onGestureStart);
      el.removeEventListener("gesturechange", onGestureChange);
    };
  }, [zoomAt]);

  const canPan = natural.w * current.scale > boxSize.w || natural.h * current.scale > boxSize.h;

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 || !canPan) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    setDragging(true);
  };
  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const moved = { ...current, x: current.x + e.clientX - d.x, y: current.y + e.clientY - d.y };
    drag.current = { ...d, x: e.clientX, y: e.clientY };
    setView(clampView(moved, natural, boxSize));
  };
  const endDrag = () => {
    drag.current = null;
    setDragging(false);
  };

  if (error) return <Unsupported entry={entry} text={t("viewer.cannotShow")} onDownload={onDownload} />;

  const atFit = Math.abs(current.scale - fit) < 0.001;
  return (
    <div
      ref={box}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={(e) => (atFit ? zoomAt(1, e.clientX, e.clientY) : setView(null))}
      className={`relative size-full touch-none overflow-hidden select-none ${canPan ? (dragging ? "cursor-grabbing" : "cursor-grab") : ""}`}
    >
      <img
        src={src}
        alt={entry.name}
        draggable={false}
        onLoad={(e) => setImg({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
        onError={() => setError(true)}
        style={{
          width: natural.w || undefined,
          height: natural.h || undefined,
          transform: `translate(-50%, -50%) translate(${current.x}px, ${current.y}px) scale(${current.scale})`,
        }}
        className={`absolute top-1/2 left-1/2 max-w-none ${img ? "" : "opacity-0"}`}
      />
      {!img && <Spinner />}
      {img && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring}
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          className="absolute right-3 bottom-3 flex items-center gap-1 rounded-full bg-mantle/90 p-1 pl-4 shadow-xl shadow-crust/40 ring-1 ring-surface0 backdrop-blur-md"
        >
          <span className="min-w-12 text-center text-xs font-semibold text-subtext0 tabular-nums">
            {Math.round(current.scale * 100)}%
          </span>
          <IconButton tone="ghost" title={t("viewer.zoomReset")} disabled={atFit} onClick={() => setView(null)}>
            <Shrink className="size-4" />
          </IconButton>
        </motion.div>
      )}
    </div>
  );
}
