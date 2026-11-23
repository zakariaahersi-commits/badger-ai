import type { NextConfig } from "next";
import path from "node:path";

const isDev = process.env.NODE_ENV !== "production";
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://in.layers.com",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  // Keep visual QA and local capture frames free of the floating development
  // badge. Compilation errors still appear in the browser error overlay.
  devIndicators: false,
  turbopack: {
    root: process.cwd(),
  },
  webpack(config, { webpack }) {
    // @layers/core-wasm 3.2.0 ships the binary in pkg/ while its generated
    // browser loader resolves it beside dist/. Point only that generated
    // request at the asset that is actually present in the published package.
    config.resolve.alias = {
      ...config.resolve.alias,
      "@layers/core-wasm$": path.resolve(
        process.cwd(),
        "lib/layers-core-browser-shim.ts",
      ),
      "rrweb$": path.resolve(process.cwd(), "lib/rrweb-disabled.ts"),
      "./layers_core_bg.wasm": path.resolve(
        process.cwd(),
        "node_modules/@layers/core-wasm/pkg/layers_core_bg.wasm",
      ),
    };
    const layersWasm = path.resolve(
      process.cwd(),
      "node_modules/@layers/core-wasm/pkg/layers_core_bg.wasm",
    );
    config.plugins.push(new webpack.NormalModuleReplacementPlugin(
      /layers_core_bg\.wasm$/,
      layersWasm,
    ));
    config.module.rules.push({ test: /layers_core_bg\.wasm$/, type: "asset/resource" });
    return config;
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self)" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
