export interface UploadItem {
  file: File;
  /** 相对当前目录的路径，文件夹上传时包含子目录 */
  path: string;
}

function readAll(reader: FileSystemDirectoryReader) {
  return new Promise<FileSystemEntry[]>((resolve, reject) => {
    const out: FileSystemEntry[] = [];
    const next = () =>
      reader.readEntries((batch) => {
        if (!batch.length) return resolve(out);
        out.push(...batch);
        next();
      }, reject);
    next();
  });
}

async function walk(entry: FileSystemEntry, prefix: string, out: UploadItem[]) {
  if (entry.isFile) {
    const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
    out.push({ file, path: prefix + entry.name });
  } else if (entry.isDirectory) {
    const children = await readAll((entry as FileSystemDirectoryEntry).createReader());
    for (const child of children) await walk(child, `${prefix}${entry.name}/`, out);
  }
}

/** 解析拖拽进来的文件和文件夹 */
export async function collectDropped(dt: DataTransfer): Promise<UploadItem[]> {
  const entries = [...dt.items]
    .filter((i) => i.kind === "file")
    .map((i) => i.webkitGetAsEntry())
    .filter((e): e is FileSystemEntry => !!e);
  if (!entries.length) return [...dt.files].map((file) => ({ file, path: file.name }));
  const out: UploadItem[] = [];
  for (const e of entries) await walk(e, "", out);
  return out;
}

export function fromInput(list: FileList | null): UploadItem[] {
  return [...(list ?? [])].map((file) => ({ file, path: file.webkitRelativePath || file.name }));
}
