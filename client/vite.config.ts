import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => {
  // Read the repo-root .env so the dev proxy follows the API's PORT.
  const env = loadEnv(mode, "..", "");
  const apiPort = env.PORT || "5000";
  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      proxy: { "/api": { target: `http://localhost:${apiPort}`, changeOrigin: true } },
    },
    build: { sourcemap: true },
    test: { environment: "node", include: ["src/**/*.test.ts"] },
  };
});
