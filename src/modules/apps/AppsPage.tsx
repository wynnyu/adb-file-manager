import { PackagePlus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback } from "react";
import { NoDevice } from "../../components/NoDevice.tsx";
import { DropOverlay } from "../../components/overlays/index.ts";
import { ShellLayout } from "../../components/shell/index.ts";
import { spring } from "../../components/ui.tsx";
import { useFileDrop, useShell } from "../../hooks/index.ts";
import { useT } from "../../i18n/index.tsx";
import { AppDetail, AppList, AppToolbar } from "./components/index.ts";
import { useAppOps, useApps } from "./hooks/index.ts";

export function AppsPage() {
  const t = useT();
  const { devices, device, reconnecting, modes, adbError, online, flash } = useShell();
  const apps = useApps();
  const ops = useAppOps();
  const { serial, selected } = apps;

  const { install } = ops;
  const onDrop = useCallback((dt: DataTransfer) => install([...dt.files]), [install]);
  const onDropError = useCallback((err: Error) => flash(t("drop.readFailed", { error: err.message })), [flash, t]);
  const drop = useFileDrop(online, onDrop, onDropError);

  return (
    <ShellLayout
      dropProps={drop.dragProps}
      panelOverlay={
        <DropOverlay show={drop.dragging} icon={PackagePlus}>
          {t("apps.drop")}
        </DropOverlay>
      }
    >
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
            key="apps"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={spring}
            className="flex flex-col gap-4"
          >
            <AppToolbar
              loading={apps.loading}
              search={apps.search}
              onSearchChange={apps.setSearch}
              filter={apps.filter}
              onFilterChange={apps.setFilter}
              counts={apps.counts}
              shown={apps.visible.length}
              onRefresh={apps.reload}
              onInstall={ops.install}
            />
            <div className="grid min-h-[40vh] gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
              {/* 窄屏选中应用后详情替换列表 */}
              <div className={selected ? "hidden min-w-0 lg:block" : "min-w-0"}>
                <AppList
                  apps={apps.visible}
                  selected={selected?.pkg ?? null}
                  loading={apps.loading && !apps.ready}
                  error={apps.error}
                  onSelect={apps.select}
                />
              </div>
              {selected && serial && (
                <AppDetail
                  key={selected.pkg}
                  serial={serial}
                  entry={selected}
                  ops={ops}
                  onBack={() => apps.select(null)}
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </ShellLayout>
  );
}
