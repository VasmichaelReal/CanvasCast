/* CanvasCast service worker: робить гід галереї доступним без інтернету.
 *
 *  cc-media   — зображення й аудіо. Їх кладе сюди сторінка кнопкою «Зберегти
 *               для роботи без інтернету»; тут вони лише віддаються (cache-first,
 *               файли незмінні).
 *  cc-runtime — сторінка гіда, її скрипти/стилі та JSON галереї (network-first:
 *               онлайн завжди свіже, офлайн — остання збережена копія).
 *
 * Сторінки й API редактора (/e/, /api/e/) не кешуються ніколи: там секретний токен.
 */
const MEDIA = 'cc-media-v1';
const RUNTIME = 'cc-runtime-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname;

  if (path.startsWith('/api/media/')) {
    event.respondWith(serveMedia(req, url));
    return;
  }
  const cacheable =
    path.startsWith('/g/') ||
    path.startsWith('/api/v/') ||
    path.startsWith('/_next/static/') ||
    path === '/icon.svg' ||
    path === '/manifest.webmanifest';
  if (cacheable) event.respondWith(networkFirst(req, url));
});

async function networkFirst(req, url) {
  const cache = await caches.open(RUNTIME);
  try {
    const res = await fetch(req);
    if (res.ok && res.type === 'basic') cache.put(url.pathname, res.clone()).catch(() => {});
    return res;
  } catch (err) {
    const cached = await cache.match(url.pathname);
    if (cached) return cached;
    throw err;
  }
}

async function serveMedia(req, url) {
  const cache = await caches.open(MEDIA);
  const cached = await cache.match(url.pathname);
  if (!cached) return fetch(req);
  const range = req.headers.get('range');
  return range ? sliceForRange(cached, range) : cached;
}

/* Аудіоплеєр просить файл частинами (Range). У кеші лежить файл цілком, тож
 * потрібний шматок вирізаємо самі — інакше перемотування офлайн не працює. */
async function sliceForRange(res, rangeHeader) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  const buf = await res.arrayBuffer();
  const size = buf.byteLength;
  if (!match || (match[1] === '' && match[2] === '')) {
    return new Response(buf, { status: 200, headers: res.headers });
  }
  let start;
  let end;
  if (match[1] === '') {
    start = Math.max(0, size - Number(match[2]));
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  if (start >= size || start > end) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': res.headers.get('Content-Type') || 'application/octet-stream',
      'Content-Length': String(end - start + 1),
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Accept-Ranges': 'bytes',
    },
  });
}
