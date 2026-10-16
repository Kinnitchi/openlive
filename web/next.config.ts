import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false, // evita montar/desmontar 2x o WebSocket/WebRTC em dev
};

export default nextConfig;
