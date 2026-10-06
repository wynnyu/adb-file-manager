import { createApp } from "./app.ts";

const PORT = Number(process.env.PORT) || 3001;
const HOST = "127.0.0.1";

createApp().listen(PORT, HOST, (err?: Error) => {
  if (err) {
    console.error(
      (err as NodeJS.ErrnoException).code === "EADDRINUSE"
        ? `端口 ${PORT} 已被占用，可通过 PORT=<端口> 指定其他端口`
        : err.message,
    );
    process.exit(1);
  }
  console.log(`ADB 文件管理器已启动：http://${HOST}:${PORT}`);
});
