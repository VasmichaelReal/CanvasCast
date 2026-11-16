import sharp from 'sharp';
import { ALLOWED_IMAGE_FORMATS } from '@canvascast/core';

export interface ProcessedImage {
  image: Buffer;
  thumb: Buffer;
}

/**
 * Перевіряє файл за вмістом (а не за розширенням чи заявленим MIME) і готує дві
 * версії: основну та мініатюру для списку й офлайн-кешу. Перекодування в JPEG
 * заодно прибирає метадані (EXIF, геолокацію).
 * Кидає Error з текстом для користувача, якщо файл не підходить.
 */
export async function processUpload(input: Buffer): Promise<ProcessedImage> {
  let format: string | undefined;
  try {
    format = (await sharp(input).metadata()).format;
  } catch {
    throw new Error('Файл не є зображенням або пошкоджений');
  }
  if (!format || !(ALLOWED_IMAGE_FORMATS as readonly string[]).includes(format)) {
    throw new Error('Підтримуються лише JPEG, PNG та WebP');
  }

  const base = () => sharp(input).rotate().flatten({ background: '#ffffff' });
  try {
    const [image, thumb] = await Promise.all([
      base().resize(2400, 2400, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer(),
      base().resize(720, 720, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 78 }).toBuffer(),
    ]);
    return { image, thumb };
  } catch {
    throw new Error('Не вдалося обробити зображення');
  }
}
