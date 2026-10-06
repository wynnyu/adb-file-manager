import { useQueryClient } from "@tanstack/react-query";
import { Check, Lock, TriangleAlert } from "lucide-react";
import { motion } from "motion/react";
import { useId, useState } from "react";
import { useT } from "../../i18n/index.tsx";
import { api, formatMode, formatOctal, parseOctal, statQuery, type Target } from "../../lib/index.ts";
import type { FileStat } from "../../types.ts";
import { PillButton, press } from "../ui.tsx";
import { Section } from "./PropertiesParts.tsx";

/** 输入所有者和用户组时给出的常见取值 */
const COMMON_IDS = ["root", "shell", "system", "media_rw", "sdcard_rw"];

const WHO = [
  { key: "props.owner", shift: 6 },
  { key: "props.group", shift: 3 },
  { key: "props.others", shift: 0 },
] as const;

const WHAT = [
  { key: "props.read", bit: 4 },
  { key: "props.write", bit: 2 },
  { key: "props.exec", bit: 1 },
] as const;

const inputClass =
  "h-10 min-w-0 rounded-full bg-mantle px-4 font-mono text-sm text-text ring-1 ring-surface1 outline-none focus:ring-2 focus:ring-accent disabled:opacity-50 aria-invalid:ring-red";

/** 权限、所有者和用户组的查看与修改；父组件用 key 在数据刷新后重建，输入框随之回到新值 */
export function PermissionEditor({
  stat,
  target,
  flash,
}: {
  stat: FileStat;
  target: Target;
  flash: (message: string) => void;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const listId = useId();
  const origMode = stat.mode & 0o7777;
  const origOwner = stat.user ?? String(stat.uid);
  const origGroup = stat.group ?? String(stat.gid);
  const [mode, setMode] = useState(origMode);
  const [modeText, setModeText] = useState(formatOctal(origMode));
  const [owner, setOwner] = useState(origOwner);
  const [group, setGroup] = useState(origGroup);
  const [recursive, setRecursive] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDir = stat.type === "dir";
  const lock = stat.protected ? "props.protected" : stat.type === "link" ? "props.linkReadonly" : null;
  const modeValid = parseOctal(modeText) !== null;
  const changed = mode !== origMode || owner !== origOwner || group !== origGroup;
  const canApply = !lock && !busy && modeValid && Boolean(owner.trim()) && Boolean(group.trim()) && changed;

  const setBits = (next: number) => {
    setMode(next);
    setModeText(formatOctal(next));
  };

  const onModeText = (v: string) => {
    setModeText(v);
    const parsed = parseOctal(v);
    if (parsed !== null) setMode(parsed);
  };

  async function apply() {
    setBusy(true);
    setError(null);
    const paths = [stat.path];
    const deep = recursive && isDir;
    try {
      // 固定写成 4 位：3 位数字不会清除目录上的 setgid
      if (mode !== origMode) await api.chmod(target, paths, mode.toString(8).padStart(4, "0"), deep);
      if (owner !== origOwner || group !== origGroup) {
        await api.chown(
          target,
          paths,
          owner !== origOwner ? owner.trim() : undefined,
          group !== origGroup ? group.trim() : undefined,
          deep,
        );
      }
      flash(t("props.applied", { name: stat.name }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setConfirming(false);
      // 部分成功时也要刷新，界面以设备上的实际状态为准
      await queryClient.invalidateQueries({ queryKey: statQuery(target, stat.path).queryKey });
    }
  }

  function submit() {
    if (!canApply) return;
    if (recursive && isDir && !confirming) setConfirming(true);
    else void apply();
  }

  return (
    <form
      className="flex w-full flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Section title={t("props.permissions")}>
        <div className="grid grid-cols-[1fr_repeat(3,2.75rem)] items-center gap-y-1 py-2.5 text-sm">
          <span />
          {WHAT.map((w) => (
            <span key={w.key} className="text-center text-xs text-muted">
              {t(w.key)}
            </span>
          ))}
          {WHO.map((who) => (
            <div key={who.key} className="contents">
              <span className="text-muted">{t(who.key)}</span>
              {WHAT.map((w) => {
                const bit = w.bit << who.shift;
                const on = (mode & bit) !== 0;
                return (
                  <motion.button
                    key={w.key}
                    type="button"
                    aria-pressed={on}
                    aria-label={`${t(who.key)} ${t(w.key)}`}
                    disabled={!!lock || busy}
                    onClick={() => setBits(mode ^ bit)}
                    {...press}
                    className={`mx-auto grid size-8 place-items-center rounded-circle transition-colors disabled:pointer-events-none disabled:opacity-50 ${
                      on ? "bg-accent text-on-accent" : "bg-surface0 text-transparent hover:bg-surface1"
                    }`}
                  >
                    <Check className="size-4" strokeWidth={3} />
                  </motion.button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between gap-3 py-2.5">
          <label htmlFor={`${listId}-mode`} className="text-sm text-muted">
            {t("props.mode")}
          </label>
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-muted">{formatMode(mode)}</span>
            <input
              id={`${listId}-mode`}
              value={modeText}
              onChange={(e) => onModeText(e.target.value)}
              disabled={!!lock || busy}
              maxLength={4}
              inputMode="numeric"
              spellCheck={false}
              aria-invalid={!modeValid}
              title={modeValid ? undefined : t("props.invalidMode")}
              className={`${inputClass} w-24 text-center`}
            />
          </div>
        </div>
        {(["owner", "group"] as const).map((field) => {
          const [value, setValue] = field === "owner" ? [owner, setOwner] : [group, setGroup];
          return (
            <div key={field} className="flex items-center justify-between gap-3 py-2.5">
              <label htmlFor={`${listId}-${field}`} className="text-sm text-muted">
                {t(field === "owner" ? "props.owner" : "props.group")}
              </label>
              <input
                id={`${listId}-${field}`}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                disabled={!!lock || busy}
                list={listId}
                spellCheck={false}
                className={`${inputClass} w-44 text-right`}
              />
            </div>
          );
        })}
        <datalist id={listId}>
          {COMMON_IDS.map((id) => (
            <option key={id} value={id} />
          ))}
        </datalist>
      </Section>

      {lock && (
        <p className="flex items-center gap-2 rounded-2xl bg-surface0 px-4 py-2 text-left text-xs text-subtext1">
          <Lock className="size-4 shrink-0" />
          {t(lock)}
        </p>
      )}

      {isDir && !lock && (
        <button
          type="button"
          aria-pressed={recursive}
          disabled={busy}
          onClick={() => {
            setRecursive((r) => !r);
            setConfirming(false);
          }}
          className="flex items-center gap-3 self-center rounded-full bg-base py-1.5 pr-5 pl-1.5 text-sm font-semibold text-subtext1 transition-colors hover:bg-surface0 disabled:opacity-50"
        >
          <span
            className={`grid size-7 place-items-center rounded-circle ring-2 transition-colors ${
              recursive ? "bg-peach text-crust ring-peach" : "text-transparent ring-surface2"
            }`}
          >
            <Check className="size-4" strokeWidth={3} />
          </span>
          {t("props.recursive")}
        </button>
      )}

      {confirming && (
        <p className="flex items-start gap-2 rounded-2xl bg-peach/15 px-4 py-2 text-left text-sm text-peach">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          {t("props.confirmRecursive", { name: stat.name })}
        </p>
      )}

      {error && <p className="rounded-2xl bg-red/15 px-4 py-2 text-sm text-red wrap-anywhere">{error}</p>}

      {!lock && (
        <div className="flex gap-2">
          {confirming && (
            <PillButton className="h-11 flex-1 justify-center" disabled={busy} onClick={() => setConfirming(false)}>
              {t("common.cancel")}
            </PillButton>
          )}
          <PillButton
            type="submit"
            tone={confirming ? "warn" : "accent"}
            className="h-11 flex-1 justify-center"
            disabled={!canApply}
          >
            {busy ? t("common.processing") : confirming ? t("props.confirmApply") : t("props.apply")}
          </PillButton>
        </div>
      )}
    </form>
  );
}
