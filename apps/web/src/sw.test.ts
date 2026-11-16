import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/** Завантажує public/sw.js у пісочниці й дістає з нього функцію нарізання діапазонів. */
function loadServiceWorker() {
  const code = readFileSync(fileURLToPath(new URL('../public/sw.js', import.meta.url)), 'utf8');
  const self = { addEventListener() {}, location: { origin: 'http://localhost' } };
  return new Function('self', 'caches', `${code}; return { sliceForRange };`)(self, {}) as {
    sliceForRange: (res: Response, range: string) => Promise<Response>;
  };
}

const { sliceForRange } = loadServiceWorker();
const cached = () => new Response(new TextEncoder().encode('0123456789'), { headers: { 'Content-Type': 'audio/mpeg' } });
const text = async (res: Response) => new TextDecoder().decode(await res.arrayBuffer());

describe('service worker: перемотування аудіо з офлайн-кешу', () => {
  it('віддає запитаний шматок файлу', async () => {
    const res = await sliceForRange(cached(), 'bytes=2-5');
    expect(res.status).toBe(206);
    expect(await text(res)).toBe('2345');
    expect(res.headers.get('Content-Range')).toBe('bytes 2-5/10');
    expect(res.headers.get('Content-Type')).toBe('audio/mpeg');
  });

  it('відкритий діапазон — до кінця файлу', async () => {
    const res = await sliceForRange(cached(), 'bytes=7-');
    expect(await text(res)).toBe('789');
    expect(res.headers.get('Content-Range')).toBe('bytes 7-9/10');
  });

  it('суфіксний діапазон — останні N байтів', async () => {
    const res = await sliceForRange(cached(), 'bytes=-3');
    expect(await text(res)).toBe('789');
  });

  it('кінець за межами файлу обрізається', async () => {
    const res = await sliceForRange(cached(), 'bytes=8-999');
    expect(await text(res)).toBe('89');
    expect(res.headers.get('Content-Range')).toBe('bytes 8-9/10');
  });

  it('початок за межами файлу — 416', async () => {
    const res = await sliceForRange(cached(), 'bytes=50-60');
    expect(res.status).toBe(416);
    expect(res.headers.get('Content-Range')).toBe('bytes */10');
  });
});
