import { Cable, Loader2, ShieldCheck, Smartphone } from "lucide-react";
import { motion } from "motion/react";
import type { Device } from "../types.ts";
import { useT } from "../i18n/index.tsx";
import type { MessageKey } from "../i18n/zh.ts";
import { spring } from "./ui.tsx";

const steps: { Icon: typeof Smartphone; title: MessageKey; text: MessageKey }[] = [
  { Icon: Smartphone, title: "nodevice.step1.title", text: "nodevice.step1.text" },
  { Icon: Cable, title: "nodevice.step2.title", text: "nodevice.step2.text" },
  { Icon: ShieldCheck, title: "nodevice.step3.title", text: "nodevice.step3.text" },
];

export function NoDevice({ devices, adbError }: { devices: Device[]; adbError: string | null }) {
  const t = useT();
  const unauthorized = devices.some((d) => d.state === "unauthorized");
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={spring}
      className="flex flex-col items-center gap-8 px-2 py-12 text-center"
    >
      <div className="relative grid size-28 place-items-center rounded-[50%] bg-accent/10">
        <span className="absolute inset-0 animate-ping rounded-[50%] bg-accent/10 [animation-duration:2.4s]" />
        <motion.span
          animate={{ rotate: [0, -8, 8, -4, 0], y: [0, -4, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 1.2, ease: "easeInOut" }}
          className="grid size-20 place-items-center rounded-[50%] bg-accent/20 text-accent"
        >
          <Smartphone className="size-9" />
        </motion.span>
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-extrabold">{unauthorized ? t("nodevice.unauthorized") : t("nodevice.connect")}</h2>
        <p className="flex items-center justify-center gap-2 text-subtext0">
          <Loader2 className="size-4 animate-spin" /> {t("nodevice.waiting")}
        </p>
        {adbError && <p className="mx-auto rounded-full bg-red/15 px-4 py-2 text-sm text-red">{t("nodevice.adbError", { error: adbError })}</p>}
      </div>
      <ol className="grid w-full max-w-4xl gap-3 md:grid-cols-3">
        {steps.map(({ Icon, title, text }, i) => (
          <motion.li
            key={title}
            initial={{ opacity: 0, y: 24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ ...spring, delay: 0.15 + i * 0.08 }}
            whileHover={{ y: -4 }}
            className="flex flex-col items-center gap-3 rounded-[2rem] bg-base p-6">
            <span className="relative grid size-14 place-items-center rounded-[50%] bg-surface0 text-lavender">
              <Icon className="size-6" />
              <span className="absolute -top-1 -right-1 grid size-6 place-items-center rounded-[50%] bg-accent text-xs font-extrabold text-crust">
                {i + 1}
              </span>
            </span>
            <h3 className="font-extrabold">{t(title)}</h3>
            <p className="text-sm text-subtext0">{t(text)}</p>
          </motion.li>
        ))}
      </ol>
    </motion.div>
  );
}
