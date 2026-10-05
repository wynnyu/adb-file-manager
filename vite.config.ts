import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/** 第三方依赖的 JS（样式表仍和界面的打包在一起） */
const dep = (pattern: RegExp) => (id: string) => pattern.test(id) && !id.endsWith(".css");

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist/web",
    rolldownOptions: {
      output: {
        // 第三方依赖单独成块：依赖不变时文件名不变，升级后浏览器可以继续用缓存。
        // 同等优先级按声明顺序匹配，最后一组兜底
        codeSplitting: {
          groups: [
            { name: "react", test: dep(/node_modules[\\/](react|react-dom|scheduler)[\\/]/) },
            { name: "motion", test: dep(/node_modules[\\/](motion|framer-motion|motion-dom|motion-utils)[\\/]/) },
            { name: "vendor", test: dep(/node_modules[\\/]/) },
          ],
        },
      },
    },
  },
  server: {
    host: "127.0.0.1",
    proxy: { "/api": "http://127.0.0.1:3001" },
  },
});
