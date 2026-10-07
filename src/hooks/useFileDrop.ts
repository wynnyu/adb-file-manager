import { type DragEvent, useCallback, useMemo, useRef, useState } from "react";

/** 放在接收拖放的容器上的事件处理；禁用时为空对象 */
interface DragProps {
  onDragEnter?: (e: DragEvent) => void;
  onDragOver?: (e: DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (e: DragEvent) => Promise<void>;
}

/** 禁用时始终返回同一个对象，让 dragProps 保持稳定 */
const NO_DRAG_PROPS: DragProps = {};

/**
 * 把文件拖进窗口。enabled 为 false 时不响应拖拽；dragProps 放在接收拖放的容器上。
 * 放下后把 DataTransfer 交给 onDrop，由调用方读取并处理，读取或处理出错时回调 onError
 */
export function useFileDrop(
  enabled: boolean,
  onDrop: (dt: DataTransfer) => Promise<void>,
  onError: (e: Error) => void,
) {
  const [dragging, setDragging] = useState(false);
  /** 拖过子元素时 enter / leave 成对触发，计数归零才算真正离开 */
  const depth = useRef(0);

  const onDragEnter = useCallback((e: DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    depth.current++;
    setDragging(true);
  }, []);

  const onDragOver = useCallback((e: DragEvent) => {
    if (e.dataTransfer.types.includes("Files")) e.preventDefault();
  }, []);

  const onDragLeave = useCallback(() => {
    if (--depth.current <= 0) {
      depth.current = 0;
      setDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault();
      depth.current = 0;
      setDragging(false);
      try {
        await onDrop(e.dataTransfer);
      } catch (err) {
        onError(err as Error);
      }
    },
    [onDrop, onError],
  );

  const dragProps = useMemo<DragProps>(
    () => (enabled ? { onDragEnter, onDragOver, onDragLeave, onDrop: handleDrop } : NO_DRAG_PROPS),
    [enabled, onDragEnter, onDragOver, onDragLeave, handleDrop],
  );

  return { dragging, dragProps };
}
