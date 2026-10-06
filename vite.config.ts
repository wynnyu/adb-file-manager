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
            {
              name: "codemirror",
              test: dep(
                /node_modules[\\/](@codemirror[\\/](state|view|language|search|commands)|@lezer[\\/](common|lr|highlight)|style-mod|w3c-keyname|crelt|@marijn[\\/]find-cluster-break)[\\/]/,
              ),
            },
            // 其余 CodeMirror 语言包（含 language-data 引用的第三方包）不进 vendor，保持按需加载
            // pnpm 的路径里有两层 node_modules，所以不能只匹配第一层之后的目录
            {
              name: "vendor",
              test: (id) => dep(/node_modules[\\/]/)(id) && !/node_modules[\\/](@codemirror|@lezer)[\\/]/.test(id),
            },
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
