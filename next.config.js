/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: '/inbox',
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  experimental: {
    instrumentationHook: true,
    serverComponentsExternalPackages: ['better-sqlite3', 'imapflow'],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push({ 'better-sqlite3': 'commonjs better-sqlite3' });
    }
    return config;
  },
};
module.exports = nextConfig;
