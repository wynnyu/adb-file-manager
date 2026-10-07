import { Cable, Loader2, RefreshCw, RotateCw, ShieldCheck, Smartphone } from "lucide-react";
import { motion } from "motion/react";
import { useReauthorize } from "../hooks/index.ts";
import type { MessageKey } from "../i18n/index.tsx";
import { useI18n } from "../i18n/index.tsx";
import type { Device, DeviceMode } from "../types.ts";
import { PillButton, spring } from "./ui.tsx";

const steps: { Icon: typeof Smartphone; title: MessageKey; text: MessageKey }[] = [
  { Icon: Smartphone, title: "nodevice.step1.title", text: "nodevice.step1.text" },
  { Icon: Cable, title: "nodevice.step2.title", text: "nodevice.step2.text" },
  { Icon: ShieldCheck, title: "nodevice.step3.title", text: "nodevice.step3.text" },
];

/** 设备离线或待授权时有专门的排查指引，不算“模式不符” */
const GUIDED_MODES: DeviceMode[] = ["offline", "unauthorized"];

/** 当前模块不可用时的页面：没有设备、等待重新连接、设备模式不符，或设备待授权 */
export function NoDevice({
  devices,
  device,
  reconnecting = false,
  modes,
  adbError,
}: {
  devices: Device[];
  /** 当前设备，没有选中设备时为 null */
  device: Device | null;
  /** 当前设备已消失，正在等它重启或换模式后重新出现 */
  reconnecting?: boolean;
  /** 当前模块可用的设备模式 */
  modes: DeviceMode[];
  adbError: string | null;
}) {
  const { t, lang } = useI18n();
  const wrongMode =
    !reconnecting && device != null && !GUIDED_MODES.includes(device.mode) && !modes.includes(device.mode);
  const unauthorized = !reconnecting && !wrongMode && devices.some((d) => d.mode === "unauthorized");
  const modeNames = new Intl.ListFormat(lang === "zh" ? "zh-CN" : "en", { type: "disjunction" }).format(
    modes.map((m) => t(`device.mode.${m}`)),
  );
  const { pending, error, reconnect, restart } = useReauthorize();
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={spring}
      className="flex flex-col items-center gap-8 px-2 py-12 text-center"
    >
      <div className="grid size-28 place-items-center rounded-circle bg-accent/10">
        <span className="grid size-20 place-items-center rounded-circle bg-accent/20 text-accent">
          <Smartphone className="size-9" />
        </span>
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-extrabold">
          {wrongMode && device
            ? t("nodevice.wrongMode", { mode: t(`device.mode.${device.mode}`) })
            : reconnecting
              ? t("nodevice.reconnecting")
              : unauthorized
                ? t("nodevice.unauthorized")
                : t("nodevice.connect")}
        </h2>
        {wrongMode ? (
          <p className="text-subtext0">{t("nodevice.needMode", { modes: modeNames })}</p>
        ) : (
          <p className="flex items-center justify-center gap-2 text-subtext0">
            <Loader2 className="size-4 animate-spin" /> {t("nodevice.waiting")}
          </p>
        )}
        {adbError && (
          <p className="mx-auto rounded-full bg-red/15 px-4 py-2 text-sm text-red">
            {t("nodevice.adbError", { error: adbError })}
          </p>
        )}
        {unauthorized && (
          <div className="mt-2 flex flex-col items-center gap-3">
            <PillButton
              tone="accent"
              disabled={pending !== null}
              onClick={reconnect}
              icon={
                pending === "reconnect" ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />
              }
            >
              {t("nodevice.reauthorize")}
            </PillButton>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <PillButton
                tone="ghost"
                disabled={pending !== null}
                onClick={restart}
                icon={
                  pending === "restart" ? <Loader2 className="size-4 animate-spin" /> : <RotateCw className="size-4" />
                }
              >
                {t("nodevice.restartAdb")}
              </PillButton>
              <span className="text-xs text-muted">{t("nodevice.restartAdbHint")}</span>
            </div>
            {error && <p className="mx-auto rounded-full bg-red/15 px-4 py-2 text-sm text-red">{error}</p>}
            <ul className="max-w-xl list-inside list-disc text-left text-sm text-subtext0">
              <li>{t("nodevice.tip1")}</li>
              <li>{t("nodevice.tip2")}</li>
              <li>{t("nodevice.tip3")}</li>
            </ul>
          </div>
        )}
      </div>
      {!wrongMode && !reconnecting && (
        <ol className="grid w-full max-w-4xl gap-3 md:grid-cols-3">
          {steps.map(({ Icon, title, text }, i) => (
            <li key={title} className="flex flex-col items-center gap-3 rounded-4xl bg-base p-6">
              <span className="relative grid size-14 place-items-center rounded-circle bg-surface0 text-lavender">
                <Icon className="size-6" />
                <span className="absolute -top-1 -right-1 grid size-6 place-items-center rounded-circle bg-accent text-xs font-extrabold text-on-accent">
                  {i + 1}
                </span>
              </span>
              <h3 className="font-extrabold">{t(title)}</h3>
              <p className="text-sm text-subtext0">{t(text)}</p>
            </li>
          ))}
        </ol>
      )}
    </motion.div>
  );
}
