/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @tote/core and @tote/db ship as TypeScript source; let Next transpile them.
  transpilePackages: ["@tote/core", "@tote/db", "@tote/services", "@tote/ai"],
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client", "bcryptjs", "@anthropic-ai/sdk", "pdfkit"],
  },
  webpack: (config) => {
    // @tote/core / @tote/db use NodeNext-style ".js" specifiers that point at
    // ".ts" source. Let webpack resolve those the same way tsc and vitest do.
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default nextConfig;
