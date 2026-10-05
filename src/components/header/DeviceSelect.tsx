import { ChevronDown, Smartphone } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useT } from "../../i18n/index.tsx";
import type { MessageKey } from "../../i18n/zh.ts";
import type { Device } from "../../types.ts";
import { spring } from "../ui.tsx";

const stateStyle: Record<string, [MessageKey, string]> = {
  device: ["device.device", "bg-green"],
  unauthorized: ["device.unauthorized", "bg-yellow"],
  offline: ["device.offline", "bg-red"],
};

/** 连上时 ping 一次提示状态变化；key 跟着 state 走，状态不变就不重放 */
function Dot({ state }: { state: string }) {
  const color = stateStyle[state]?.[1] ?? "bg-overlay0";
  return (
    <span className="relative flex size-2.5">
      {state === "device" && (
        <span
          key={state}
          className={`absolute inset-0 animate-ping rounded-[50%] opacity-60 [animation-iteration-count:1] ${color}`}
        />
      )}
      <span className={`relative size-2.5 rounded-[50%] ${color}`} />
    </span>
  );
}

export function DeviceSelect({
  devices,
  serial,
  onChange,
}: {
  devices: Device[];
  serial: string | null;
  onChange: (serial: string) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = devices.find((d) => d.serial === serial);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <motion.button
        type="button"
        whileTap={{ scale: 0.96 }}
        transition={spring}
        onClick={() => setOpen((o) => !o)}
        // 窄屏只显示图标，名称要靠 title 和 aria-label 提供
        title={current?.name ?? t("device.none")}
        aria-label={current?.name ?? t("device.none")}
        className="flex h-12 items-center gap-2 rounded-full bg-surface0 py-1 pr-3 pl-1 transition-colors hover:bg-surface1 sm:gap-3 sm:pr-4"
      >
        <span className="relative grid size-10 place-items-center rounded-[50%] bg-accent/20 text-accent">
          <Smartphone className="size-5" />
          {/* 窄屏只留图标，连接状态改用角标 */}
          {current && (
            <span className="absolute right-0 bottom-0 flex rounded-[50%] ring-2 ring-surface0 sm:hidden">
              <Dot state={current.state} />
            </span>
          )}
        </span>
        <span className="hidden flex-col items-start leading-tight sm:flex">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={current?.serial ?? "none"}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="max-w-[7rem] truncate text-sm font-bold sm:max-w-[10rem]"
            >
              {current ? current.name : t("device.none")}
            </motion.span>
          </AnimatePresence>
          <span className="flex items-center gap-1.5 text-xs text-subtext1">
            {current ? (
              <>
                <Dot state={current.state} />
                {stateStyle[current.state] ? t(stateStyle[current.state][0]) : current.state}
              </>
            ) : (
              t("device.waiting")
            )}
          </span>
        </span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={spring}>
          <ChevronDown className="size-4 text-overlay1" />
        </motion.span>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: -6, transition: { duration: 0.12 } }}
            transition={spring}
            style={{ originX: 1, originY: 0 }}
            className="absolute right-0 z-30 mt-2 flex w-72 flex-col gap-1 rounded-[1.75rem] bg-mantle p-2 shadow-2xl shadow-crust ring-1 ring-surface0"
          >
            {devices.length === 0 && (
              <div className="rounded-full px-4 py-3 text-sm text-subtext0">{t("device.noneDetected")}</div>
            )}
            {devices.map((d) => (
              <button
                key={d.serial}
                type="button"
                onClick={() => {
                  onChange(d.serial);
                  setOpen(false);
                }}
                className={`flex items-center gap-3 rounded-full p-1.5 pr-4 text-left transition-colors hover:bg-surface0 ${
                  d.serial === serial ? "bg-surface0" : ""
                }`}
              >
                <span className="grid size-9 place-items-center rounded-[50%] bg-surface1 text-subtext1">
                  <Smartphone className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{d.name}</span>
                  <span className="block truncate font-mono text-[11px] text-muted">{d.serial}</span>
                </span>
                <Dot state={d.state} />
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
