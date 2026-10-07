import posix from "node:path/posix";
import { Router } from "express";
import type { TextPreview } from "../shared/types.d.ts";
import * as adb from "./adb.ts";
import * as fs from "./fs-cmds.ts";
import { msg } from "./i18n.ts";
import { ctxOf, wrap } from "./request.ts";

/** 可经 /api/preview 读取的媒体文件；浏览器能否解码由前端处理，这里只给出真实类型 */
const MEDIA_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".3gp": "video/3gpp",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg",
  ".amr": "audio/amr",
};

/** 文本预览最多读取的字节数 */
const TEXT_LIMIT = 1024 * 1024;
/** 在开头这么多字节里出现 NUL 就当作二进制文件 */
const SNIFF_BYTES = 8192;

/**
 * 解析 Range 请求头。返回 null 表示按完整内容响应（没有 Range、格式不对或多段），
 * "unsatisfiable" 表示范围超出文件，应返回 416
 */
export function parseRange(header: string | undefined, size: number): fs.ByteRange | "unsatisfiable" | null {
  const m = header?.trim().match(/^bytes=(\d*)-(\d*)$/);
  if (!m || (!m[1] && !m[2])) return null;
  const [a, b] = [m[1] ? Number(m[1]) : null, m[2] ? Number(m[2]) : null];
  if ((a !== null && !Number.isSafeInteger(a)) || (b !== null && !Number.isSafeInteger(b))) return null;
  // bytes=-n：最后 n 个字节
  if (a === null) {
    if (b === 0 || size === 0) return "unsatisfiable";
    return { start: Math.max(0, size - (b ?? 0)), end: size - 1 };
  }
  if (b !== null && b < a) return null;
  if (a >= size) return "unsatisfiable";
  return { start: a, end: b === null ? size - 1 : Math.min(b, size - 1) };
}

/** 末尾不完整的 UTF-8 序列的长度：截断时可能把一个多字节字符切成两半 */
function partialTail(buf: Buffer) {
  for (let i = 1; i <= Math.min(3, buf.length); i++) {
    const byte = buf[buf.length - i];
    if ((byte & 0xc0) === 0x80) continue; // 续字节，继续往前找首字节
    const need = byte >= 0xf0 ? 4 : byte >= 0xe0 ? 3 : byte >= 0xc0 ? 2 : 1;
    return need > i ? i : 0;
  }
  return 0;
}

/**
 * 把读到的文件开头解码为文本。buf 比 limit 长说明文件被截断；
 * 含 NUL 或不是合法 UTF-8 时判为二进制（GBK、UTF-16 等编码也按二进制处理）
 */
export function decodeText(buf: Buffer, limit: number): TextPreview {
  const truncated = buf.length > limit;
  let data = truncated ? buf.subarray(0, limit) : buf;
  if (data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf) data = data.subarray(3);
  if (data.subarray(0, SNIFF_BYTES).includes(0)) return { kind: "binary" };
  if (truncated) data = data.subarray(0, data.length - partialTail(data));
  try {
    const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(data);
    return { kind: "text", text, truncated, limit };
  } catch {
    return { kind: "binary" };
  }
}

/** 在页面内查看文件：媒体文件以字节流返回（支持 Range），其余文件读取开头作为文本 */
export function previewRoutes() {
  const router = Router();

  router.get(
    "/api/preview",
    wrap(async (req, res) => {
      const p = adb.assertAbs(req.query.path);
      const type = MEDIA_TYPES[posix.extname(p).toLowerCase()];
      if (!type) throw new adb.AdbError(msg("notPreviewable"), 415);
      const ctx = await ctxOf(req);
      const size = await fs.fileSize(ctx, p);
      const range = parseRange(req.get("range"), size);
      res.setHeader("Accept-Ranges", "bytes");
      if (range === "unsatisfiable") {
        res.setHeader("Content-Range", `bytes */${size}`);
        throw new adb.AdbError(msg("badRange"), 416);
      }
      res.setHeader("Content-Type", type);
      res.setHeader("X-Content-Type-Options", "nosniff");
      // SVG 里的脚本不许跑
      res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'; style-src 'unsafe-inline'");
      res.setHeader("Cache-Control", "no-store");
      if (range) {
        res.status(206);
        res.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
        res.setHeader("Content-Length", range.end - range.start + 1);
      } else res.setHeader("Content-Length", size);
      if (req.method === "HEAD") {
        res.end();
        return;
      }
      const child = fs.cat(ctx, p, range ?? undefined);
      res.on("close", () => child.kill());
      child.stdout.pipe(res);
    }),
  );

  router.get(
    "/api/text",
    wrap(async (req, res) => {
      const p = adb.assertAbs(req.query.path);
      const ctx = await ctxOf(req);
      // 先确认文件存在且可读，否则 head 读不到内容会被当成空文件
      await fs.fileSize(ctx, p);
      res.json(decodeText(await fs.head(ctx, p, TEXT_LIMIT + 1), TEXT_LIMIT));
    }),
  );

  return router;
}
