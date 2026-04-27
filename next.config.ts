import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@napi-rs/canvas",
    "sharp",
    "tesseract.js",
    "pdf-parse",
  ],
};

export default nextConfig;
