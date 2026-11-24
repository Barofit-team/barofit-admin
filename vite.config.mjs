import { defineConfig } from "vite";
export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/auth": "http://127.0.0.1:3100",
      "/admin-api": "http://127.0.0.1:3100",
    },
  },
  build: { outDir: "dist" },
});
