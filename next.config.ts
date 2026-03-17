import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    // Next/Image optimization disabled for Cloudflare Pages compatibility
    // Use plain <img> tags instead (already done throughout)
    unoptimized: true,
  },
}

export default nextConfig
