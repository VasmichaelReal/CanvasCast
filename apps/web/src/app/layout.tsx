import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'CanvasCast — аудіогід для незрячих відвідувачів', template: '%s — CanvasCast' },
  description:
    'Інклюзивний AI-гід для мистецьких просторів: художня аудіодескрипція картин для людей із порушеннями зору.',
  icons: { icon: '/icon.svg' },
  // Сторінки доступні лише за секретними посиланнями — пошуковикам тут нічого індексувати.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#faf7f2' },
    { media: '(prefers-color-scheme: dark)', color: '#151311' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uk">
      <body>
        <a href="#main" className="btn sr-only-focusable fixed left-3 top-3 z-50">
          Перейти до основного вмісту
        </a>
        {children}
      </body>
    </html>
  );
}
