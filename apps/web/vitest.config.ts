import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    exclude: [...configDefaults.exclude, "e2e/**"],
    coverage: { provider: "v8", reporter: ["text", "json", "html"] },
  },
});
