import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'CanvasCast — аудіогід галереї',
    short_name: 'CanvasCast',
    description: 'Художня аудіодескрипція картин для людей із порушеннями зору.',
    start_url: '/',
    display: 'standalone',
    background_color: '#faf7f2',
    theme_color: '#9a3412',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
}
