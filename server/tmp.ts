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
