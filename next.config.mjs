/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
  images: { unoptimized: true },
  output: process.env.GITHUB_ACTIONS ? 'export' : undefined,
  basePath: process.env.GITHUB_ACTIONS ? '/centrologisticofrimaralV2' : '',
  transpilePackages: ['motion'],
};

export default nextConfig;
