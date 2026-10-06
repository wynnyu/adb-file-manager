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
