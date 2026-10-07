import path from "node:path/posix";
import type { ArchiveFormat, FileEntry } from "../shared/types.d.ts";
import * as adb from "./adb.ts";
import { msg as t } from "./i18n.ts";

export const LINK_MARK = "__ADBFM_LINKDIRS__";

export async function ls(ctx: adb.Ctx, dir: string): Promise<FileEntry[]> {
  // 末尾加 / 让 find 跟随 /sdcard 这类符号链接目录
  const base = dir === "/" ? "/" : dir + "/";
  const cmd =
    `find ${adb.q(base)} -mindepth 1 -maxdepth 1 -exec stat -c '%F|%s|%Y|%X|%n' {} + 2>/dev/null; ` +
    `echo ${LINK_MARK}; ` +
    `find ${adb.q(base)} -mindepth 1 -maxdepth 1 -type l -exec sh -c 'for f; do [ -d "$f" ] && echo "$f"; done' _ {} + 2>/dev/null; ` +
    `if [ ! -d ${adb.q(base)} ]; then echo __ADBFM_NOTDIR__; elif [ ! -r ${adb.q(base)} ]; then echo __ADBFM_NOPERM__; fi`;
  const out = await adb.shell(ctx, cmd);
  if (out.includes("__ADBFM_NOTDIR__")) throw new adb.AdbError(t("noDir", { path: dir }), 404);
  if (out.includes("__ADBFM_NOPERM__")) {
    throw new adb.AdbError(t(ctx.root ? "noReadRoot" : "noRead", { path: dir }), 403);
  }
  return parseLs(out);
}

/** 解析 ls 的输出：每行 `类型|大小|mtime|atime|路径`，LINK_MARK 之后是指向目录的符号链接 */
export function parseLs(out: string): FileEntry[] {
  const [statPart, linkPart = ""] = out.split(LINK_MARK);
  const linkDirs = new Set(
    linkPart
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  const entries: FileEntry[] = [];
  for (const line of statPart.split("\n")) {
    if (!line) continue;
    const parts = line.split("|");
    if (parts.length < 5) continue;
    const [kind, size, mtime, atime] = parts;
    const full = parts.slice(4).join("|").replace(/\r$/, "");
    const p = path.normalize(full);
    const type = kind === "directory" ? "dir" : kind === "symbolic link" ? "link" : "file";
    entries.push({
      name: path.basename(p),
      path: p,
      type,
      isDir: type === "dir" || (type === "link" && linkDirs.has(full)),
      size: Number(size) || 0,
      mtime: Number(mtime) || 0,
      atime: Number(atime) || 0,
    });
  }
  return entries;
}

export async function isDir(ctx: adb.Ctx, p: string) {
  const out = await adb.shell(ctx, `[ -d ${adb.q(p)} ] && echo D || ([ -e ${adb.q(p)} ] && echo F || echo N)`);
  const r = out.trim();
  if (r === "N") throw new adb.AdbError(t("noFile", { path: p }), 404);
  return r === "D";
}

/** 解析符号链接后的真实路径（readlink -f），不存在的路径原样返回 */
export async function realpaths(ctx: adb.Ctx, paths: string[]): Promise<string[]> {
  // 每个路径固定输出一行，解析失败时为空行
  const out = await adb.shell(ctx, paths.map((p) => `echo "$(readlink -f ${adb.q(p)} 2>/dev/null)"`).join("; "));
  const lines = out.split("\n").map((l) => l.replace(/\r$/, ""));
  return paths.map((p, i) => (lines[i]?.startsWith("/") ? path.normalize(lines[i]) : p));
}

export const mkdir = (ctx: adb.Ctx, p: string) => adb.checked(ctx, `mkdir -p ${adb.q(p)}`);
export const rename = (ctx: adb.Ctx, from: string, to: string) =>
  adb.checked(ctx, `[ ! -e ${adb.q(to)} ] || { echo ${adb.EXISTS_MARK}; exit 1; }; mv ${adb.q(from)} ${adb.q(to)}`);
export const remove = (ctx: adb.Ctx, paths: string[]) => adb.checked(ctx, `rm -rf ${paths.map(adb.q).join(" ")}`);

/** 修改权限位；mode 须已通过 parseModeInput 校验 */
export const chmod = (ctx: adb.Ctx, paths: string[], mode: string, recursive: boolean) =>
  adb.checked(ctx, `chmod ${recursive ? "-R " : ""}${mode} ${paths.map(adb.q).join(" ")}`);

/** 修改所有者或用户组；owner 和 group 须已通过 parseOwnerInput 校验，至少给一个 */
export const chown = (
  ctx: adb.Ctx,
  paths: string[],
  owner: string | undefined,
  group: string | undefined,
  recursive: boolean,
) =>
  adb.checked(
    ctx,
    `chown ${recursive ? "-R " : ""}${adb.q(`${owner ?? ""}${group ? `:${group}` : ""}`)} ${paths.map(adb.q).join(" ")}`,
  );

/** 校验权限位输入，只接受 3 到 4 位八进制数字 */
export function parseModeInput(v: unknown): string {
  if (typeof v !== "string" || !/^[0-7]{3,4}$/.test(v)) throw new adb.AdbError(t("badMode"), 400);
  return v;
}

/** 校验所有者或用户组输入：名称或数字 id，缺省时返回 undefined */
export function parseOwnerInput(v: unknown): string | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "string" || !/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(v)) throw new adb.AdbError(t("badOwner"), 400);
  return v;
}

/**
 * 在 shell 中把变量 t 设为 destDir 下不重名的路径：重名时依次改成“名字 2.扩展名”“名字 3.扩展名”……。
 * src 是要放进去的源，为目录时名字里的点不算扩展名（com.example.app 不该变成 com.example 2.app）。
 * 给出 suffix 时以它作为扩展名，用于 .tar.gz 这类复合扩展名（a.tar.gz 重名后是 a 2.tar.gz）
 */
function uniqueTarget(destDir: string, name: string, src: string, suffix?: string) {
  const dot = name.lastIndexOf(".");
  const [base, ext] =
    suffix !== undefined && name.endsWith(suffix)
      ? [name.slice(0, name.length - suffix.length), suffix]
      : dot > 0
        ? [name.slice(0, dot), name.slice(dot)]
        : [name, ""];
  // 悬空的符号链接 -e 为假，但同样会挡住 cp 和 mv，要一并避开
  return (
    `b=${adb.q(base)}; e=${adb.q(ext)}; [ -d ${adb.q(src)} ] && { b=${adb.q(name)}; e=; }; ` +
    `t=${adb.q(destDir)}/"$b$e"; i=2; while [ -e "$t" ] || [ -L "$t" ]; do t=${adb.q(destDir)}/"$b $i$e"; i=$((i+1)); done`
  );
}

/** 复制到目标目录下；重名时依次改成“名字 2.扩展名”“名字 3.扩展名”……，从不覆盖 */
export function copyInto(ctx: adb.Ctx, src: string, destDir: string) {
  return adb.checked(ctx, `${uniqueTarget(destDir, path.basename(src), src)}; cp -R ${adb.q(src)} "$t"`);
}

/** 压缩包里列目录、解压用的设备端命令；zip 用 unzip，其余用 toybox 的 tar */
const ARCHIVE_TOOL: Record<ArchiveFormat, string> = { zip: "unzip", tar: "tar", tgz: "tar", tbz: "tar" };
const TAR_FLAG: Record<ArchiveFormat, string> = { zip: "", tar: "", tgz: "z", tbz: "j" };

const EXIT_MARK = "__ADBFM_EXIT__";

/** 列出压缩包内容的原始输出，交给 archive.ts 解析 */
export async function listArchive(ctx: adb.Ctx, p: string, format: ArchiveFormat) {
  const list = format === "zip" ? `unzip -lv ${adb.q(p)}` : `tar -tv${TAR_FLAG[format]}f ${adb.q(p)}`;
  // 标记写在命令之后：输出里可能含有文件名，退出码只能靠它之后的标记判断
  const out = await adb.shell(ctx, `${list} 2>&1; echo ${EXIT_MARK}$?`, { timeout: 0 });
  const at = out.lastIndexOf(EXIT_MARK);
  const body = at < 0 ? out : out.slice(0, at);
  const code = at < 0 ? 1 : Number.parseInt(out.slice(at + EXIT_MARK.length), 10);
  if (code === 0) return body;
  if (/not found/i.test(body)) throw new adb.AdbError(t("archiveToolMissing", { tool: ARCHIVE_TOOL[format] }), 501);
  throw new adb.AdbError(adb.cleanError(body.trim()), 400);
}

const PATH_MARK = "__ADBFM_PATH__";

/**
 * 解压的设备端命令。先解到压缩包所在目录的暂存目录 stage，再按不重名的名字移到最终位置：
 * single 非空时移出 stage 下的这一项，否则把 stage 整个改名为 wrapper，最后删除暂存目录（失败时也删）。
 * tar 的 -o 不还原属主，root 模式下也不会产生奇怪的 uid
 */
export function extractCmd(p: string, format: ArchiveFormat, single: string | null, wrapper: string, stage: string) {
  const dir = path.dirname(p);
  const extract =
    format === "zip"
      ? `unzip -o -q ${adb.q(p)} -d ${adb.q(stage)}`
      : `tar -xo${TAR_FLAG[format]}f ${adb.q(p)} -C ${adb.q(stage)}`;
  const src = single === null ? stage : `${stage}/${single}`;
  return (
    `mkdir ${adb.q(stage)} || exit 1; r=1; ` +
    `if ${extract}; then ${uniqueTarget(dir, single ?? wrapper, src)}; mv ${adb.q(src)} "$t"; r=$?; fi; ` +
    `rm -rf ${adb.q(stage)}; [ $r = 0 ] && echo ${PATH_MARK}"$t"; exit $r`
  );
}

/** 取出命令输出里由 PATH_MARK 标记的路径 */
function markedPath(out: string) {
  const line = out.split("\n").find((l) => l.startsWith(PATH_MARK));
  if (!line) throw new adb.AdbError(t("adbFailed"));
  return line.slice(PATH_MARK.length).replace(/\r$/, "");
}

/** 解压压缩包，返回解出的文件夹或文件的路径；single 是压缩包里唯一的顶层项目名，没有则为 null */
export async function extract(ctx: adb.Ctx, p: string, format: ArchiveFormat, single: string | null, wrapper: string) {
  const stage = path.join(path.dirname(p), `.adbfm-extract-${Math.random().toString(36).slice(2, 10)}`);
  return markedPath(await adb.checked(ctx, extractCmd(p, format, single, wrapper, stage)));
}

/** 压缩包的扩展名，与前端 lib/kinds.ts 的 archiveFormat 识别的格式一致 */
export const ARCHIVE_EXT: Record<ArchiveFormat, string> = { zip: ".zip", tar: ".tar", tgz: ".tar.gz", tbz: ".tar.bz2" };

/**
 * tar 系格式压缩的设备端命令。先写到 base 下的暂存文件 stage，成功后按不重名的名字改名为 name，
 * 失败时删除暂存文件，不留下半个压缩包。names 是相对 base 的路径；toybox 的 tar 只认最后一个 -C，
 * 所以所有名称都以同一个 base 为准。chown 为 true 时把压缩包交给 base 的所有者，root 模式下避免生成 root 属主的文件
 */
export function packCmd(
  base: string,
  names: string[],
  format: ArchiveFormat,
  name: string,
  stage: string,
  chown: boolean,
) {
  const create = `tar -c${TAR_FLAG[format]}f ${adb.q(stage)} -C ${adb.q(base)} -- ${names.map(adb.q).join(" ")}`;
  return (
    `r=1; if ${create}; then ${uniqueTarget(base, name, stage, ARCHIVE_EXT[format])}; mv ${adb.q(stage)} "$t"; r=$?; fi; ` +
    `rm -f ${adb.q(stage)}; ` +
    (chown ? `[ $r = 0 ] && chown "$(stat -c %u:%g ${adb.q(base)})" "$t" 2>/dev/null; ` : "") +
    `[ $r = 0 ] && echo ${PATH_MARK}"$t"; exit $r`
  );
}

/** 在设备上把 base 下的 names 压缩为 tar 系格式，返回生成的压缩包路径 */
export async function pack(ctx: adb.Ctx, base: string, names: string[], format: ArchiveFormat, name: string) {
  const stage = path.join(base, `.adbfm-pack-${Math.random().toString(36).slice(2, 10)}`);
  try {
    return markedPath(await adb.checked(ctx, packCmd(base, names, format, name, stage, Boolean(ctx.root))));
  } catch (e) {
    if (e instanceof adb.AdbError && /permission denied|read-only/i.test(e.message)) {
      throw new adb.AdbError(t(ctx.root ? "packDeniedRoot" : "packDenied"), 403);
    }
    throw e;
  }
}

/** 设备上 dir 下不重名的文件名（不创建文件），suffix 是 name 末尾的扩展名 */
export async function uniqueName(ctx: adb.Ctx, dir: string, name: string, suffix: string) {
  const out = await adb.checked(
    ctx,
    `${uniqueTarget(dir, name, "", suffix)}; echo ${PATH_MARK}"$t"`,
    adb.QUICK_TIMEOUT,
  );
  return path.basename(markedPath(out));
}

/** 解析 du -sk 的输出，返回各项占用的字节数之和；读不了的项没有输出，不计入 */
export function parseDu(out: string) {
  let kb = 0;
  for (const line of out.split("\n")) {
    const m = /^(\d+)\s/.exec(line);
    if (m) kb += Number(m[1]);
  }
  return kb * 1024;
}

/** 这些路径合计占用的字节数，用于压缩前估算电脑上需要的空间 */
export async function diskUsage(ctx: adb.Ctx, paths: string[], signal?: AbortSignal) {
  return parseDu(await adb.shell(ctx, `du -sk ${paths.map(adb.q).join(" ")} 2>/dev/null`, { timeout: 0, signal }));
}

/** 路径之下 adb pull 会跳过的条目数：符号链接、套接字等既不是文件也不是目录的东西 */
export async function countSkipped(ctx: adb.Ctx, paths: string[]) {
  const out = await adb.shell(ctx, `find ${paths.map(adb.q).join(" ")} ! -type d ! -type f 2>/dev/null | wc -l`, {
    timeout: 0,
  });
  return Number.parseInt(out.trim(), 10) || 0;
}

/** 文件中的一段字节，start 和 end 都包含在内 */
export interface ByteRange {
  start: number;
  end: number;
}

/**
 * 读取文件的设备端命令。给出 range 时只读这一段，数字来自 parseRange，保证是非负整数。
 * 分段读取用 dd 直接跳到起点，不必像 tail 那样从头读到起点；
 * Android 10 之前的 toybox dd 不认识 skip_bytes，会立即失败且没有输出，这时退回 tail 和 head
 */
export function catCmd(p: string, range?: ByteRange) {
  // exec-out 会把设备端的 stderr 混进输出，错误信息不能当成文件内容
  if (!range) return `cat ${adb.q(p)} 2>/dev/null`;
  const len = range.end - range.start + 1;
  return (
    `dd if=${adb.q(p)} bs=65536 skip=${range.start} count=${len} iflag=skip_bytes,count_bytes 2>/dev/null || ` +
    `tail -c +${range.start + 1} ${adb.q(p)} 2>/dev/null | head -c ${len}`
  );
}

/** 以字节流读取设备上的文件（adb exec-out，不经过电脑临时目录） */
export function cat(ctx: adb.Ctx, p: string, range?: ByteRange) {
  return adb.execOutStream(ctx, catCmd(p, range));
}

/** 读取文件开头的 n 个字节 */
export const head = (ctx: adb.Ctx, p: string, n: number) =>
  adb.execOutBuffer(ctx, `head -c ${n} ${adb.q(p)} 2>/dev/null`);

/** 文件大小，符号链接取目标的大小；不存在或不可读时抛出 404 / 403 */
export async function fileSize(ctx: adb.Ctx, p: string) {
  const out = await adb.shell(
    ctx,
    `if [ ! -e ${adb.q(p)} ]; then echo __ADBFM_NOFILE__; elif [ ! -r ${adb.q(p)} ]; then echo __ADBFM_NOPERM__; ` +
      `else stat -L -c %s ${adb.q(p)}; fi`,
  );
  if (out.includes("__ADBFM_NOFILE__")) throw new adb.AdbError(t("noFile", { path: p }), 404);
  if (out.includes("__ADBFM_NOPERM__")) throw new adb.AdbError(t(ctx.root ? "noReadRoot" : "noRead", { path: p }), 403);
  const size = Number(out.trim());
  if (!Number.isSafeInteger(size) || size < 0) throw new adb.AdbError(adb.cleanError(out.trim()));
  return size;
}
