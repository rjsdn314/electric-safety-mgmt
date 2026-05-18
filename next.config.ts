// next.config.ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // ExcelJS는 Node.js 환경에서만 실행 (서버 컴포넌트/API Route)
  // 브라우저 번들에서 제외
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false, path: false, stream: false, zlib: false,
      };
    }
    return config;
  },

  // 이미지 최적화 도메인 (Supabase Storage)
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
  },

  // 환경변수 타입 안전성
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
