import { isPublicMediaKey } from '@canvascast/core';
import { getObject } from '@canvascast/storage';
import { jsonError } from '@/lib/api';

type Ctx = { params: Promise<{ key: string[] }> };

/**
 * Віддає зображення й аудіо зі сховища з того самого origin, що й застосунок —
 * так їх може кешувати service worker. Ключі містять випадкову частину й ніколи
 * не перезаписуються, тому відповідь кешується назавжди.
 * Підтримує Range — без нього перемотування аудіо не працює в Safari.
 */
export async function GET(req: Request, { params }: Ctx) {
  const key = (await params).key.join('/');
  if (!isPublicMediaKey(key)) return jsonError(404, 'Файл не знайдено');

  const range = req.headers.get('range') ?? undefined;
  let object;
  try {
    object = await getObject(key, range);
  } catch (err) {
    if ((err as { name?: string }).name === 'InvalidRange') {
      return new Response(null, { status: 416 });
    }
    throw err;
  }
  if (!object) return jsonError(404, 'Файл не знайдено');

  const headers = new Headers({
    'Content-Type': object.contentType,
    'Content-Length': String(object.contentLength),
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=31536000, immutable',
  });
  if (object.contentRange) headers.set('Content-Range', object.contentRange);
  return new Response(object.body, { status: object.contentRange ? 206 : 200, headers });
}
