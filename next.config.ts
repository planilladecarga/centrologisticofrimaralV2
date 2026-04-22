import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  // Allow access to remote image placeholder.
  images: {
    unoptimized: true, // GitHub Pages no soporta optimización de imágenes
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**', // This allows any path under the hostname
      },
    ],
  },
  output: process.env.GITHUB_ACTIONS ? 'export' : undefined,
  basePath: process.env.GITHUB_ACTIONS ? '/centrologisticofrimaralV2' : undefined,
  transpilePackages: ['motion'],
  serverExternalPackages: ['z-ai-web-dev-sdk'],
  // Proxy local para temperaturas (solo funciona en modo servidor, no en static export)
  async rewrites() {
    if (process.env.GITHUB_ACTIONS) return [];
    return [
      {
        source: '/api/temperatura/sensors',
        destination: 'http://192.168.150.31/TemperaturaWeb/get_sensors.php',
      },
      {
        source: '/api/temperatura/data',
        destination: 'http://192.168.150.31/TemperaturaWeb/monitor_temperatura.php',
      },
    ];
  },
  webpack: (config, {dev}) => {
    // HMR is disabled in AI Studio via DISABLE_HMR env var.
    // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
    if (dev && process.env.DISABLE_HMR === 'true') {
      config.watchOptions = {
        ignored: /.*/,
      };
    }
    return config;
  },
};

export default nextConfig;
