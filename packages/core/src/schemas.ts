import { z } from 'zod';
import { LANGS } from './types';

const trimmed = (max: number) => z.string().trim().max(max);
/** Необов'язкове текстове поле: порожній рядок зберігаємо як null. */
const optionalText = (max: number) =>
  trimmed(max).nullish().transform((v) => (v ? v : null));

export const langSchema = z.enum(LANGS);

export const createGallerySchema = z.object({
  name: trimmed(120).min(1),
  lang: langSchema.default('uk'),
  /** Власник підтверджує, що має право завантажувати зображення (авторське право). */
  rightsConfirmed: z.literal(true),
});

export const updateGallerySchema = z.object({
  name: trimmed(120).min(1).optional(),
  lang: langSchema.optional(),
});

export const updatePaintingSchema = z.object({
  title: optionalText(200),
  author: optionalText(200),
  year: optionalText(60),
  technique: optionalText(200),
  context: optionalText(2000),
  /** Зсув у списку: -1 вгору, +1 вниз. */
  move: z.union([z.literal(-1), z.literal(1)]).optional(),
}).partial();

export const updateDescriptionSchema = z.object({
  text: trimmed(8000).min(1),
});

export const ALLOWED_IMAGE_FORMATS = ['jpeg', 'png', 'webp'] as const;
export const MAX_FILES_PER_UPLOAD = 20;
