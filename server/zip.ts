import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import posix from "node:path/posix";
import { pipeline } from "node:stream/promises";
import { type EntryData, ZipArchive, type ZipEntryData } from "archiver";
import * as adb from "./adb.ts";
import { msg } from "./i18n.ts";
import { TMP, tmpDir } from "./tmp.ts";

/** 已经压缩过的格式，再压缩几乎没有收益，直接存储以节省时间 */
const PRECOMPRESSED =
  /\.(jpe?g|png|gif|webp|heic|heif|avif|mp4|m4v|mkv|mov|webm|3gp|mp3|m4a|aac|ogg|opus|flac|zip|apk|apks|xapk|jar|aar|gz|tgz|bz2|tbz2?|xz|7z|rar|zst|lz4)$/i;

export const isPrecompressed = (name: string) => PRECOMPRESSED.test(name);

/** 把 src 目录下的全部内容打成 zip 写到 out，条目名相对 src；含空目录和隐藏文件 */
export async function buildZip(src: string, out: string) {
  const zip = new ZipArchive({ zlib: { level: 6 } });
  const written = pipeline(zip, createWriteStream(out));
  // directory 的回调类型只声明了 EntryData，实际接受 ZipEntryData 的 store
  zip.directory(src, false, (entry: EntryData) => {
    const data: ZipEntryData = entry;
    if (data.stats?.isFile() && isPrecompressed(data.name)) data.store = true;
    return data;
  });
  await zip.finalize();
  await written;
}

/** 电脑临时目录当前可用的字节数 */
async function hostFree() {
  const s = await fs.statfs(TMP);
  return s.bavail * s.bsize;
}

/**
 * 设备端没有 zip 命令，所以在电脑上生成：pull 到临时目录，打包，再 push 回 base。
 * name 是压缩包的文件名。adb pull 会跳过符号链接，返回的 skipped 是被跳过的条目数。临时目录无论成败都会删除
 */
export async function compressZip(ctx: adb.Ctx, base: string, names: string[], name: string) {
  const paths = names.map((n) => posix.join(base, n));
  // 拉取的副本和 zip 本身同时存在，按源大小的两倍预留空间
  if ((await adb.diskUsage(ctx, paths)) * 2 > (await hostFree())) throw new adb.AdbError(msg("hostNoSpace"), 507);
  const skipped = await adb.countSkipped(ctx, paths);
  const dir = await tmpDir();
  try {
    const src = path.join(dir, "src");
    for (const n of names) {
      // 按相对路径落盘，不同目录下的同名项不会冲突；pull 的目标目录须先存在，否则会被当成文件夹本身
      const local = path.join(src, posix.dirname(n));
      await fs.mkdir(local, { recursive: true });
      await adb.pull(ctx, posix.join(base, n), local);
    }
    const built = path.join(dir, "pack.zip");
    await buildZip(src, built);
    // push 以本地文件名作为设备上的名字，所以最后才定名并改名，缩小与其他写入撞名的时间窗口
    const final = await adb.uniqueName(ctx, base, name, adb.ARCHIVE_EXT.zip);
    const named = path.join(dir, final);
    await fs.rename(built, named);
    await adb.push(ctx, [named], base);
    return { path: posix.join(base, final), skipped };
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
