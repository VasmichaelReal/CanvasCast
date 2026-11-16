import type { PublicGallery } from '@canvascast/core';

/** Назви кешів мають збігатися з public/sw.js. */
const MEDIA = 'cc-media-v1';
const RUNTIME = 'cc-runtime-v1';

const versionKey = (viewToken: string) => `cc-offline:${viewToken}`;

export function offlineSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'caches' in window;
}

export function registerServiceWorker(): void {
  if (!offlineSupported()) return;
  navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
    /* без service worker гід працює, просто лише онлайн */
  });
}

/** Версія галереї, збережена на цьому пристрої, або null, якщо копії немає. */
export function readSavedVersion(viewToken: string): number | null {
  try {
    const raw = localStorage.getItem(versionKey(viewToken));
    const n = raw === null ? NaN : Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/**
 * Зберігає на пристрої все, що потрібно гіду без мережі: оболонку сторінки,
 * дані галереї, аудіо та мініатюри. Повні зображення не зберігаємо — вони важкі,
 * а для слухача головне — звук і текст.
 */
export async function downloadGallery(
  viewToken: string,
  gallery: PublicGallery,
  onProgress: (done: number, total: number) => void,
): Promise<void> {
  // Просимо браузер не вичищати сховище за нестачі місця (може відмовити — не критично).
  await navigator.storage?.persist?.().catch(() => false);

  const media = [
    ...new Set(gallery.paintings.flatMap((p) => [p.thumbUrl, p.audioUrl]).filter((u): u is string => !!u)),
  ];

  // Оболонка: сама сторінка, її скрипти й стилі, дані галереї. Під час першого
  // візиту service worker ще не керував сторінкою, тому ці файли кладемо в кеш самі.
  const shell = [
    ...new Set([
      window.location.pathname,
      `/api/v/${viewToken}/gallery`,
      '/icon.svg',
      ...performance
        .getEntriesByType('resource')
        .map((entry) => new URL(entry.name, window.location.href))
        .filter((url) => url.origin === window.location.origin && url.pathname.startsWith('/_next/static/'))
        .map((url) => url.pathname),
    ]),
  ];

  const total = media.length + shell.length;
  let done = 0;
  onProgress(done, total);

  const [mediaCache, runtimeCache] = await Promise.all([caches.open(MEDIA), caches.open(RUNTIME)]);

  // Свіжу версію беремо з щойно збережених даних, а не з того, що на екрані:
  // галерею могли змінити, поки сторінка була відкрита.
  let savedVersion = gallery.version;

  const fetchInto = async (cache: Cache, path: string, required: boolean) => {
    try {
      const res = await fetch(path, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`${path}: ${res.status}`);
      if (path.startsWith('/api/v/')) {
        savedVersion = ((await res.clone().json()) as PublicGallery).version;
      }
      await cache.put(path, res);
    } catch (err) {
      if (required) throw err;
    } finally {
      onProgress(++done, total);
    }
  };

  // Скрипти з попередніх збірок можуть уже не існувати — їх відсутність не помилка.
  await runPool(shell, 4, (path) => fetchInto(runtimeCache, path, !path.startsWith('/_next/static/')));

  // Медіа незмінні: що вже лежить у кеші — не качаємо вдруге.
  await runPool(media, 3, async (path) => {
    if (await mediaCache.match(path)) {
      onProgress(++done, total);
      return;
    }
    await fetchInto(mediaCache, path, true);
  });

  // Прибираємо файли цієї галереї, яких у ній більше немає (видалені картини, старе аудіо).
  const prefix = galleryMediaPrefix(media);
  if (prefix) {
    const keep = new Set(media);
    for (const request of await mediaCache.keys()) {
      const path = new URL(request.url).pathname;
      if (path.startsWith(prefix) && !keep.has(path)) await mediaCache.delete(request);
    }
  }

  localStorage.setItem(versionKey(viewToken), String(savedVersion));
}

/** "/api/media/g/<galleryId>/" — спільний префікс усіх файлів однієї галереї. */
function galleryMediaPrefix(media: string[]): string | null {
  const match = /^\/api\/media\/g\/[^/]+\//.exec(media[0] ?? '');
  return match ? match[0] : null;
}

async function runPool<T>(items: T[], size: number, task: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(size, queue.length) }, async () => {
      for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
        await task(item);
      }
    }),
  );
}
