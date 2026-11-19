import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans, Literata } from 'next/font/google';
import './globals.css';

const sans = IBM_Plex_Sans({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600'],
  variable: '--font-plex',
  display: 'swap',
});

const serif = Literata({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-literata',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'CanvasCast — аудіогід для незрячих відвідувачів', template: '%s — CanvasCast' },
  description: 'Художня аудіодескрипція картин для людей із порушеннями зору.',
  icons: { icon: '/icon.svg' },
  // Сторінки доступні лише за секретними посиланнями — пошуковикам тут нічого індексувати.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbfbfa' },
    { media: '(prefers-color-scheme: dark)', color: '#121212' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uk" className={`${sans.variable} ${serif.variable}`}>
      <body>
        <a href="#main" className="btn btn-primary sr-only-focusable fixed left-3 top-3 z-50">
          Перейти до основного вмісту
        </a>
        {children}
      </body>
    </html>
  );
}
