/** 可安装的文件扩展名；.apks 和 .xapk 是分包，后端要求单独安装 */
export const INSTALL_EXTS = [".apk", ".apks", ".xapk"] as const;

export const isInstallable = (name: string) => {
  const lower = name.toLowerCase();
  return INSTALL_EXTS.some((ext) => lower.endsWith(ext));
};

const BASE_APK = /^base\.apk$/i;
const SPLIT_APK = /^split_.+\.apk$/i;

export interface InstallPlan<T> {
  /** 每组装成一个应用，一组对应一次安装 */
  groups: T[][];
  /** 扩展名不支持的文件 */
  unsupported: T[];
}

/**
 * 把选中的文件分成安装组：同时选中 base.apk 与 split_*.apk 时，视为同一应用的一组分包（从设备拷出的分包应用）；
 * 其余每个文件单独一组。组按首个文件在原列表中的位置排序，不支持的文件单独返回
 */
export function groupInstall<T extends { name: string }>(files: T[]): InstallPlan<T> {
  const unsupported = files.filter((f) => !isInstallable(f.name));
  const installable = files.filter((f) => isInstallable(f.name));
  const base = installable.find((f) => BASE_APK.test(f.name));
  const splits = base ? installable.filter((f) => SPLIT_APK.test(f.name)) : [];
  const groups: T[][] = [];
  for (const f of installable) {
    if (f === base && splits.length) groups.push([base, ...splits]);
    else if (!splits.includes(f) || !base) groups.push([f]);
  }
  return { groups, unsupported };
}
