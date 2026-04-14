import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
  output: process.env.GITHUB_ACTIONS ? 'export' : undefined,
  basePath: process.env.GITHUB_ACTIONS ? '/centrologisticofrimaralV2' : undefined,
  transpilePackages: ['motion'],
  turbopack: {},
};

export default nextConfig;
