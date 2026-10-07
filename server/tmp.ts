import { mkdirSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/** 上传、下载、压缩经过电脑时使用的临时目录的根 */
export const TMP = path.join(os.tmpdir(), "adb-file-manager");

mkdirSync(TMP, { recursive: true });

/** 新建一个本次任务专用的临时目录，用完须由调用方删除 */
export async function tmpDir() {
  return fs.mkdtemp(path.join(TMP, "job-"));
}

/**
 * 清空临时目录根下的全部内容：服务崩溃或被强制结束后残留的 job-* 目录，以及 multer 直接写在根下的上传文件。
 * 默认同一时间只运行一个服务实例，因此启动时可以放心全部删除；不在模块加载时执行，避免测试导入时误删
 */
export async function cleanTmp() {
  for (const name of await fs.readdir(TMP).catch(() => [])) {
    await fs
      .rm(path.join(TMP, name), { recursive: true, force: true })
      .catch((e) => console.warn(`清理临时文件失败：${e.message}`));
  }
}

/** 目录下全部文件的字节数之和，不跟随符号链接；目录不存在或中途被删除时按已统计的部分返回 */
export async function dirBytes(dir: string): Promise<number> {
  let total = 0;
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) total += await dirBytes(full);
    else if (e.isFile())
      total += await fs.stat(full).then(
        (s) => s.size,
        () => 0,
      );
  }
  return total;
}

/** 估算进度的上限：设备端 du 按块计，总量略大于实际字节数，不能让进度条提前满格 */
const GROWTH_CAP = 0.99;

/**
 * 每 500 毫秒统计一次 dir 的大小，以 total（字节）为分母回调进度，用于 adb pull 这类没有进度输出的命令。
 * total 不大于 0 时不回调。返回停止函数，停止后不再回调
 */
export function watchGrowth(dir: string, total: number, onProgress: (fraction: number) => void) {
  let stopped = false;
  let measuring = false;
  const timer = setInterval(async () => {
    if (measuring || total <= 0) return;
    measuring = true;
    const bytes = await dirBytes(dir);
    measuring = false;
    if (!stopped) onProgress(Math.min(GROWTH_CAP, bytes / total));
  }, 500);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
