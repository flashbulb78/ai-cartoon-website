import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Image optimization configuration
  images: {
    // Allow external images from these domains
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**', // Allow all HTTPS images for generated avatars
      },
    ],
  },
  
  // Security headers
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
        ],
      },
    ];
  },
  
  // Experimental features
  experimental: {
    // Enable server actions for better performance
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;
