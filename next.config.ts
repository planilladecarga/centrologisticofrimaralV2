import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
  images: { unoptimized: true },
  output: process.env.GITHUB_ACTIONS ? 'export' : undefined,
  basePath: process.env.GITHUB_ACTIONS ? '/centrologisticofrimaralV2' : undefined,
  transpilePackages: ['motion'],
};

export default nextConfig;
