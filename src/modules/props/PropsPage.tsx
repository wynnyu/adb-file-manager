import { AnimatePresence, motion } from "motion/react";
import { KeyValueTable } from "../../components/KeyValueTable.tsx";
import { NoDevice } from "../../components/NoDevice.tsx";
import { ShellLayout } from "../../components/shell/index.ts";
import { spring } from "../../components/ui.tsx";
import { useShell } from "../../hooks/index.ts";
import { useT } from "../../i18n/index.tsx";
import { PropToolbar } from "./components/index.ts";
import { usePropOps, useProps } from "./hooks/index.ts";

const isRo = (key: string) => key.startsWith("ro.");

export function PropsPage() {
  const t = useT();
  const { devices, device, reconnecting, modes, adbError, online, rootMode, askEnableRoot } = useShell();
  const props = useProps();
  const ops = usePropOps();
  /** ro.* 和删除都只能经 resetprop，它仅在 root 模式下检测 */
  const { resetprop } = props;

  return (
    <ShellLayout>
      <AnimatePresence mode="wait" initial={false}>
        {!online ? (
          <NoDevice
            key="none"
            devices={devices}
            device={device}
            reconnecting={reconnecting}
            modes={modes}
            adbError={adbError}
          />
        ) : (
          <motion.div
            key="props"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={spring}
            className="flex flex-col gap-4"
          >
            <PropToolbar
              loading={props.loading}
              search={props.search}
              onSearchChange={props.setSearch}
              group={props.group}
              onGroupChange={props.setGroup}
              counts={props.counts}
              shown={props.visible.length}
              onRefresh={props.reload}
              onAdd={ops.add}
              rootMode={rootMode}
              onAskRoot={askEnableRoot}
            />
            <KeyValueTable
              rows={props.visible}
              loading={props.loading && !props.ready}
              loadingText={t("prop.loading")}
              error={props.error}
              emptyText={t("prop.empty")}
              canEdit={(row) => !isRo(row.key) || resetprop}
              onEdit={ops.edit}
              onDelete={resetprop ? ops.remove : undefined}
              badge={(row) =>
                isRo(row.key) && (
                  <span className="shrink-0 rounded-full bg-surface1 px-2 py-0.5 text-2xs font-bold text-subtext0">
                    {t("prop.badge.ro")}
                  </span>
                )
              }
            />
          </motion.div>
        )}
      </AnimatePresence>
    </ShellLayout>
  );
}
