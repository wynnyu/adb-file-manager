import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, Loader2, TriangleAlert, X } from "lucide-react";
import type { ReactNode } from "react";
import { IconButton, Placeholder } from "../../../components/ui.tsx";
import { useT } from "../../../i18n/index.tsx";
import type { AppEntry, AppPermission } from "../../../types.ts";
import type { AppOps } from "../hooks/index.ts";
import { appQuery } from "../lib/index.ts";
import { AppActions } from "./AppActions.tsx";
import { AppBadge } from "./AppBadge.tsx";

function Row({ label, children, mono = false }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 py-1.5 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className={`min-w-0 break-all ${mono ? "font-mono text-xs leading-5" : ""}`}>{children}</dd>
    </div>
  );
}

function PermissionGroup({ title, items }: { title: string; items: AppPermission[] }) {
  const t = useT();
  if (items.length === 0) return null;
  return (
    <section className="flex flex-col gap-1">
      <h3 className="text-xs font-bold text-muted">
        {title} <span className="tabular-nums">{items.length}</span>
      </h3>
      <ul className="flex flex-col">
        {items.map((p) => (
          <li key={p.name} className="flex items-center gap-2 py-1">
            <span className="min-w-0 flex-1 break-all font-mono text-xs leading-5">{p.name}</span>
            {p.granted !== undefined && (
              <span
                className={`flex shrink-0 items-center gap-1 text-2xs font-bold ${p.granted ? "text-green" : "text-muted"}`}
              >
                {p.granted ? <Check className="size-3" strokeWidth={3} /> : <X className="size-3" strokeWidth={3} />}
                {t(p.granted ? "apps.detail.granted" : "apps.detail.denied")}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** 右侧的应用详情面板：版本、安装信息和权限；窄屏下替换列表，用返回按钮回到列表 */
export function AppDetail({
  serial,
  entry,
  ops,
  onBack,
}: {
  serial: string;
  entry: AppEntry;
  ops: Pick<AppOps, "run" | "extract">;
  onBack: () => void;
}) {
  const t = useT();
  const { data, error, isPending } = useQuery(appQuery(serial, entry.pkg));

  const version = data
    ? data.versionName && data.versionCode !== undefined
      ? t("apps.detail.versionValue", { name: data.versionName, code: data.versionCode })
      : (data.versionName ?? (data.versionCode === undefined ? undefined : String(data.versionCode)))
    : undefined;
  const runtime = data?.permissions.filter((p) => p.runtime) ?? [];
  const install = data?.permissions.filter((p) => !p.runtime && p.granted !== undefined) ?? [];
  const other = data?.permissions.filter((p) => !p.runtime && p.granted === undefined) ?? [];

  return (
    <section aria-label={t("apps.detail.label")} className="flex min-w-0 flex-col gap-4 rounded-card bg-base p-4">
      <header className="flex items-start gap-2">
        <IconButton tone="ghost" className="lg:hidden" title={t("apps.back")} onClick={onBack}>
          <ArrowLeft className="size-5" />
        </IconButton>
        <div className="min-w-0 flex-1 pt-1.5">
          <h2 className="break-all font-bold">{entry.pkg}</h2>
          <div className="mt-1 flex flex-wrap gap-1">
            {entry.system && <AppBadge kind="system" />}
            {entry.state !== "enabled" && <AppBadge kind={entry.state} />}
            {data?.updatedSystem && <AppBadge kind="system" label="apps.detail.updatedSystem" />}
          </div>
        </div>
      </header>

      <AppActions entry={entry} updatedSystem={data?.updatedSystem ?? false} ops={ops} />

      {error ? (
        <Placeholder icon={<TriangleAlert className="size-7" />} text={error.message} tone="bg-red/15 text-red" />
      ) : isPending ? (
        <div className="flex flex-col items-center gap-3 py-12 text-muted" role="status">
          <Loader2 className="size-6 animate-spin" />
          <span className="text-sm">{t("apps.detail.reading")}</span>
        </div>
      ) : (
        <>
          <dl className="flex flex-col divide-y divide-surface0">
            {version && <Row label={t("apps.detail.version")}>{version}</Row>}
            {data.minSdk !== undefined && <Row label={t("apps.detail.minSdk")}>{data.minSdk}</Row>}
            {data.targetSdk !== undefined && <Row label={t("apps.detail.targetSdk")}>{data.targetSdk}</Row>}
            {data.firstInstall && <Row label={t("apps.detail.firstInstall")}>{data.firstInstall}</Row>}
            {data.lastUpdate && <Row label={t("apps.detail.lastUpdate")}>{data.lastUpdate}</Row>}
            <Row label={t("apps.detail.installer")} mono={!!data.installer}>
              {data.installer ?? t("apps.detail.unknown")}
            </Row>
            {data.uid !== undefined && <Row label={t("apps.detail.uid")}>{data.uid}</Row>}
            {data.abi && <Row label={t("apps.detail.abi")}>{data.abi}</Row>}
            {data.codePath && (
              <Row label={t("apps.detail.codePath")} mono>
                {data.codePath}
              </Row>
            )}
            {data.dataDir && (
              <Row label={t("apps.detail.dataDir")} mono>
                {data.dataDir}
              </Row>
            )}
          </dl>

          <div className="flex flex-col gap-4">
            <PermissionGroup title={t("apps.detail.permRuntime")} items={runtime} />
            <PermissionGroup title={t("apps.detail.permInstall")} items={install} />
            <PermissionGroup title={t("apps.detail.permOther")} items={other} />
            {data.permissions.length === 0 && <p className="text-sm text-muted">{t("apps.detail.noPermissions")}</p>}
          </div>
        </>
      )}
    </section>
  );
}
