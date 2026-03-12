import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, "");
  const convexUrl = env.CONVEX_URL || "";

  return {
    envDir: repoRoot,
    plugins: [react()],
    define: {
      "import.meta.env.CONVEX_URL": JSON.stringify(convexUrl),
    },
  };
});
