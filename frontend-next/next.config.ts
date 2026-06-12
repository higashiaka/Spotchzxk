import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  async rewrites() {
    const target = process.env.PROXY_TARGET || 'https://spotchzxk.xyz';
    return [
      { source: '/api/:path*', destination: `${target}/api/:path*` },
      { source: '/ws/:path*', destination: `${target}/ws/:path*` },
    ];
  },
};

export default nextConfig;
