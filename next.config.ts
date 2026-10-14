import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pages are small client shells; auth + quotas are enforced in API routes.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  serverExternalPackages: ["pg", "web-tree-sitter", "@vscode/tree-sitter-wasm"],
};

export default nextConfig;
