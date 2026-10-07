import { AnimatePresence, motion } from "motion/react";
import { NoDevice } from "../../components/NoDevice.tsx";
import { ShellLayout } from "../../components/shell/index.ts";
import { spring } from "../../components/ui.tsx";
import { useShell } from "../../hooks/index.ts";
import { AppDetail, AppList, AppToolbar } from "./components/index.ts";
import { useApps } from "./hooks/index.ts";

export function AppsPage() {
  const { devices, device, reconnecting, modes, adbError, online } = useShell();
  const apps = useApps();
  const { serial, selected } = apps;

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
                <AppDetail key={selected.pkg} serial={serial} entry={selected} onBack={() => apps.select(null)} />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </ShellLayout>
  );
}
