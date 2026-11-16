import { randomBytes } from 'node:crypto';

/**
 * Ключі об'єктів у сховищі. Кожен файл отримує випадковий суфікс, тому вміст за
 * ключем ніколи не змінюється — це дозволяє кешувати медіа «назавжди» (immutable).
 */
const rand = () => randomBytes(9).toString('base64url');

export const storageKeys = {
  paintingPrefix: (galleryId: string, paintingId: string) => `g/${galleryId}/p/${paintingId}/`,
  galleryPrefix: (galleryId: string) => `g/${galleryId}/`,
  image: (galleryId: string, paintingId: string) => `g/${galleryId}/p/${paintingId}/image-${rand()}.jpg`,
  thumb: (galleryId: string, paintingId: string) => `g/${galleryId}/p/${paintingId}/thumb-${rand()}.jpg`,
  audio: (galleryId: string, paintingId: string, lang: string, ext: string) =>
    `g/${galleryId}/p/${paintingId}/audio-${lang}-${rand()}.${ext}`,
};

const KEY_RE = /^g\/[0-9a-f-]{36}\/p\/[0-9a-f-]{36}\/(image|thumb|audio)-[A-Za-z0-9_-]+\.(jpg|mp3|wav)$/;

/** Публічний медіа-роут віддає лише об'єкти такої форми. */
export function isPublicMediaKey(key: string): boolean {
  return KEY_RE.test(key);
}

export function mediaUrl(key: string): string {
  return `/api/media/${key}`;
}
