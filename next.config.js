/** @type {import('next').NextConfig} */
const nextConfig = {
  // Skip ESLint during production builds
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Skip TypeScript errors during production builds
  typescript: {
    ignoreBuildErrors: true,
  },
  // Enable instrumentation for background worker auto-start
  experimental: {
    instrumentationHook: true,
    serverComponentsExternalPackages: ['better-sqlite3', 'imapflow'],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push({
        'better-sqlite3': 'commonjs better-sqlite3',
      });
    }
    return config;
  },
};

module.exports = nextConfig;
