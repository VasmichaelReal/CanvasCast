/**
 * Розбір PDF у браузері через pdf.js: текст сторінок і вбудовані зображення, а на
 * місці кожного зображення — маркер [[IMAGE n]], як у офісних документах.
 *
 * PDF не зберігає «потоку» документа, тож місце зображення визначаємо за
 * координатами: маркер стає перед першим рядком тексту, що лежить нижче верхнього
 * краю зображення. Для звичайного каталогу «фото — підпис» цього досить.
 *
 * Модуль важкий (pdf.js), тому documents.ts підвантажує його лише для PDF.
 */
import { imageMarker } from '@canvascast/core/import';

export interface PdfImage {
  name: string;
  blob: Blob;
}

export interface ParsedPdf {
  text: string;
  images: PdfImage[];
  /** Скільки літер у тексті: 0 означає скан без текстового шару. */
  letters: number;
}

/** Пікселі зображення так, як їх віддає pdf.js. */
export interface PdfImageObject {
  width: number;
  height: number;
  /** 1 — ч/б 1 біт на піксель, 2 — RGB, 3 — RGBA */
  kind?: number;
  data?: Uint8Array | Uint8ClampedArray;
  bitmap?: CanvasImageSource;
}

export interface ParsePdfOptions {
  /** Кодує зображення в JPEG. У браузері — через canvas; тести підставляють свою. */
  encode?: (img: PdfImageObject) => Promise<Blob | null>;
  maxImages?: number;
}

/** Дрібніші зображення — значки й логотипи, фото картин такими не бувають. */
const MIN_IMAGE_SIDE = 150;
const MAX_PAGES = 200;

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const multiply = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
let pdfjsPromise: Promise<PdfJs> | null = null;

async function loadPdfJs(): Promise<PdfJs> {
  pdfjsPromise ??= import('pdfjs-dist/legacy/build/pdf.mjs').then((pdfjs) => {
    if (typeof window !== 'undefined' && typeof Worker !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerPort) {
      // Розбір у окремому потоці, щоб сторінка не зависала на великих PDF.
      pdfjs.GlobalWorkerOptions.workerPort = new Worker(
        new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url),
        { type: 'module' },
      );
    }
    return pdfjs;
  });
  return pdfjsPromise;
}

export async function parsePdf(bytes: Uint8Array, opts: ParsePdfOptions = {}): Promise<ParsedPdf> {
  const pdfjs = await loadPdfJs();
  const encode = opts.encode ?? encodeWithCanvas;
  const maxImages = opts.maxImages ?? 60;
  // Шрифти не потрібні: ми не малюємо сторінки, лише читаємо текст і зображення.
  const task = pdfjs.getDocument({ data: bytes, disableFontFace: true });
  const doc = await task.promise;
  const { OPS } = pdfjs;

  const images: PdfImage[] = [];
  const seen = new Map<string, number>(); // одне й те саме зображення на кількох сторінках — один номер
  let text = '';
  let letters = 0;
  try {
    const pages = Math.min(doc.numPages, MAX_PAGES);
    for (let n = 1; n <= pages; n++) {
      const page = await doc.getPage(n);

      // Зображення сторінки разом із їхнім верхнім краєм (y у координатах PDF зростає вгору).
      const placed: Array<{ top: number; marker: string }> = [];
      const ops = await page.getOperatorList();
      let ctm: Matrix = IDENTITY;
      const stack: Matrix[] = [];
      for (let i = 0; i < ops.fnArray.length; i++) {
        const fn = ops.fnArray[i];
        const args = ops.argsArray[i] as unknown[];
        if (fn === OPS.save) stack.push(ctm);
        else if (fn === OPS.restore) ctm = stack.pop() ?? IDENTITY;
        else if (fn === OPS.transform) ctm = multiply(ctm, args as Matrix);
        else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject) {
          // Зображення малюється в одиничний квадрат, перетворений поточною матрицею.
          const ys = [ctm[5], ctm[5] + ctm[3], ctm[5] + ctm[1], ctm[5] + ctm[1] + ctm[3]];
          const top = Math.max(...ys);
          const marker = await imageFor(fn === OPS.paintInlineImageXObject, args, page);
          if (marker) placed.push({ top, marker });
        }
      }
      placed.sort((a, b) => b.top - a.top);

      // Рядки тексту з висотою першого фрагмента.
      const content = await page.getTextContent();
      const lines: Array<{ y: number; text: string }> = [];
      let current: { y: number; text: string } | null = null;
      for (const item of content.items) {
        if (!('str' in item)) continue;
        if (!current) current = { y: item.transform[5] as number, text: '' };
        current.text += item.str;
        if (item.hasEOL) {
          lines.push(current);
          current = null;
        }
      }
      if (current) lines.push(current);

      let out = '';
      let next = 0;
      for (const line of lines) {
        while (next < placed.length && placed[next]!.top > line.y) out += placed[next++]!.marker;
        out += line.text + '\n';
      }
      while (next < placed.length) out += placed[next++]!.marker;
      letters += (out.match(/\p{L}/gu) ?? []).length - (out.match(/\[\[IMAGE \d+\]\]/g) ?? []).length * 5;
      if (pages > 1) text += `\n\n--- Сторінка ${n} ---\n`;
      text += out;
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
  return { text, images, letters };

  async function imageFor(
    inline: boolean,
    args: unknown[],
    page: { objs: PdfObjs; commonObjs: PdfObjs },
  ): Promise<string> {
    let key: string;
    let obj: PdfImageObject | null;
    if (inline) {
      obj = args[0] as PdfImageObject;
      key = `inline-${images.length}-${seen.size}`;
    } else {
      const id = String(args[0]);
      key = id;
      const known = seen.get(id);
      if (known !== undefined) return known ? `\n${imageMarker(known)}\n` : '';
      obj = await resolveObj(id.startsWith('g_') ? page.commonObjs : page.objs, id);
    }
    const fits = obj && Math.min(obj.width, obj.height) >= MIN_IMAGE_SIDE && images.length < maxImages;
    const blob = fits ? await encode(obj!).catch(() => null) : null;
    if (!blob) {
      seen.set(key, 0);
      return '';
    }
    images.push({ name: `pdf-image-${images.length + 1}.jpg`, blob });
    seen.set(key, images.length);
    return `\n${imageMarker(images.length)}\n`;
  }
}

interface PdfObjs {
  get(id: string, callback?: (data: unknown) => void): unknown;
}

/** Об'єкт сторінки може ще декодуватися — чекаємо, але не вічно. */
function resolveObj(objs: PdfObjs, id: string): Promise<PdfImageObject | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 10_000);
    try {
      objs.get(id, (data) => {
        clearTimeout(timer);
        resolve((data as PdfImageObject) ?? null);
      });
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

/** Пікселі pdf.js → RGBA для ImageData. */
export function toRgba(img: PdfImageObject): Uint8ClampedArray | null {
  const { width, height, kind, data } = img;
  if (!data) return null;
  const out = new Uint8ClampedArray(new ArrayBuffer(width * height * 4));
  if (kind === 3) {
    // Прозорість кладемо на біле тло: у JPEG прозорих пікселів не буває.
    for (let j = 0; j < out.length; j += 4) {
      const a = data[j + 3]! / 255;
      out[j] = data[j]! * a + 255 * (1 - a);
      out[j + 1] = data[j + 1]! * a + 255 * (1 - a);
      out[j + 2] = data[j + 2]! * a + 255 * (1 - a);
      out[j + 3] = 255;
    }
  } else if (kind === 2) {
    for (let i = 0, j = 0; j < out.length; i += 3, j += 4) {
      out[j] = data[i]!;
      out[j + 1] = data[i + 1]!;
      out[j + 2] = data[i + 2]!;
      out[j + 3] = 255;
    }
  } else if (kind === 1) {
    const rowBytes = Math.ceil(width / 8);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const bit = (data[y * rowBytes + (x >> 3)]! >> (7 - (x & 7))) & 1;
        const j = (y * width + x) * 4;
        out[j] = out[j + 1] = out[j + 2] = bit ? 255 : 0;
        out[j + 3] = 255;
      }
    }
  } else {
    return null;
  }
  return out;
}

async function encodeWithCanvas(img: PdfImageObject): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  if (img.bitmap) {
    ctx.fillStyle = '#ffffff'; // прозорі ділянки стають білими, як і на сервері
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img.bitmap, 0, 0, canvas.width, canvas.height);
  } else {
    const rgba = toRgba(img);
    if (!rgba) return null;
    ctx.putImageData(new ImageData(rgba as Uint8ClampedArray<ArrayBuffer>, img.width, img.height), 0, 0);
  }
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
}
