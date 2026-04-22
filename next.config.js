/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  experimental: {
    instrumentationHook: true,
    serverComponentsExternalPackages: ['pg', 'imapflow'],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push({
        pg: 'commonjs pg',
        'pg-native': 'commonjs pg-native',
      });
    }
    return config;
  },
};
module.exports = nextConfig;
