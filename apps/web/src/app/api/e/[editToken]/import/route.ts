import { NextResponse } from 'next/server';
import { MAX_IMPORT_TEXT_CHARS } from '@canvascast/core';
import { ProviderError, createLLMProvider, type ExtractInput } from '@canvascast/providers/llm';
import { NOT_FOUND, clientIp, findGalleryForEdit, jsonError, limited } from '@/lib/api';

type Ctx = { params: Promise<{ editToken: string }> };

/** Розбір великого документа моделлю може тривати кілька хвилин. */
export const maxDuration = 300;

const MAX_PDF_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_COUNT = 60;

/**
 * Імпорт картин із документа: модель розкладає його на картки, але нічого не
 * зберігає — картки повертаються власнику на перевірку, а додає їх уже редактор.
 *
 * Форма: `text` (текст, витягнутий у браузері, з маркерами [[IMAGE n]]) і `imageCount`
 * — або `file` (скан PDF, його модель читає сама) і `imageCount` — скільки зображень
 * браузер витягнув із нього за порядком. Плюс `fileName` для контексту.
 */
export async function POST(req: Request, { params }: Ctx) {
  const gallery = await findGalleryForEdit((await params).editToken);
  if (!gallery) return NOT_FOUND();

  // Кожен імпорт — дорогий виклик моделі.
  const blocked =
    (await limited(`import:${clientIp(req)}`, 10, 600)) ??
    (await limited(`import-gallery:${gallery.id}`, 30, 24 * 3600));
  if (blocked) return blocked;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError(400, 'Очікується форма з документом');
  }

  const fileName = String(form.get('fileName') ?? '').slice(0, 200) || undefined;
  const text = form.get('text');
  const file = form.get('file');
  const imageCount = Math.min(MAX_IMAGE_COUNT, Math.max(0, Number.parseInt(String(form.get('imageCount') ?? '0'), 10) || 0));

  let input: ExtractInput;
  if (typeof text === 'string') {
    if (!text.trim() && imageCount === 0) return jsonError(400, 'Документ порожній');
    input = { lang: gallery.lang, fileName, text: text.slice(0, MAX_IMPORT_TEXT_CHARS), imageCount };
  } else if (file instanceof File && file.size > 0) {
    if (file.size > MAX_PDF_BYTES) return jsonError(413, 'PDF більший за 4 МБ');
    const data = Buffer.from(await file.arrayBuffer());
    // Перевіряємо вміст, а не заявлений тип.
    if (data.subarray(0, 5).toString('latin1') !== '%PDF-') {
      return jsonError(400, 'Файлом можна надіслати лише PDF');
    }
    input = { lang: gallery.lang, fileName, file: { mimeType: 'application/pdf', data }, imageCount };
  } else {
    return jsonError(400, 'Не надано документа');
  }

  try {
    const result = await createLLMProvider().extractPaintings(input);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[import] не вдалося розібрати документ', err);
    if (err instanceof ProviderError && !err.retryable) {
      return jsonError(502, `Модель не змогла обробити документ: ${err.message}`);
    }
    return jsonError(502, 'Не вдалося розпізнати документ. Спробуйте ще раз за хвилину.');
  }
}
