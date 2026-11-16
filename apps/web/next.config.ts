import type { NextConfig } from 'next';

const config: NextConfig = {
  // Пакети монорепо постачаються як TypeScript-джерела.
  transpilePackages: [
    '@canvascast/core',
    '@canvascast/db',
    '@canvascast/storage',
    '@canvascast/queue',
  ],
  serverExternalPackages: ['bullmq', 'ioredis', 'sharp', '@prisma/client'],
  async headers() {
    return [
      {
        // Service worker має оновлюватися одразу, без HTTP-кешу.
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Токени живуть у шляху URL — не віддаємо їх стороннім сайтам через Referer.
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};

export default config;
