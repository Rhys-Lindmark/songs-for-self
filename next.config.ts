import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The public custom domain mounts this Site at /music. Prefix production
  // framework chunks while leaving local development at the origin root.
  assetPrefix: process.env.NODE_ENV === 'production' ? '/music' : undefined,
};

export default nextConfig;
