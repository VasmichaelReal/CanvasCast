import { env } from '@canvascast/core';
import { prisma, type Gallery } from '@canvascast/db';
import { enqueueGeneration } from '@canvascast/queue';

export type StartResult =
  | { ok: true; started: boolean }
  | { ok: false; status: number; message: string };

/** Задача, що «висить» довше, вважається загубленою, і її можна запустити знову. */
const IN_PROGRESS_WINDOW_MS = 10 * 60 * 1000;

/**
 * Ставить генерацію в чергу.
 *  full — опис із зображення + озвучення;
 *  tts  — лише озвучення наявного тексту (після ручної правки).
 */
export async function startGeneration(
  gallery: Gallery,
  paintingId: string,
  type: 'full' | 'tts',
): Promise<StartResult> {
  const painting = await prisma.painting.findFirst({ where: { id: paintingId, galleryId: gallery.id } });
  if (!painting) return { ok: false, status: 404, message: 'Картину не знайдено' };

  // Контроль вартості: денний ліміт генерацій на галерею.
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const used = await prisma.generationJob.count({ where: { galleryId: gallery.id, createdAt: { gte: since } } });
  if (used >= env.maxGenerationsPerGalleryPerDay) {
    return { ok: false, status: 429, message: 'Вичерпано денний ліміт генерацій для цієї галереї.' };
  }

  const existing = await prisma.description.findUnique({
    where: { paintingId_lang: { paintingId, lang: gallery.lang } },
  });

  // Повторне натискання «Згенерувати», поки задача ще в роботі, нічого не дублює.
  if (
    type === 'full' &&
    existing &&
    (existing.status === 'pending' || existing.status === 'generating') &&
    Date.now() - existing.updatedAt.getTime() < IN_PROGRESS_WINDOW_MS
  ) {
    return { ok: true, started: false };
  }
  if (type === 'tts' && !existing?.text.trim()) {
    return { ok: false, status: 400, message: 'Немає тексту для озвучення' };
  }

  const description = await prisma.description.upsert({
    where: { paintingId_lang: { paintingId, lang: gallery.lang } },
    create: { paintingId, lang: gallery.lang, status: 'pending' },
    update: { status: 'pending', error: null },
  });
  const job = await prisma.generationJob.create({
    data: { paintingId, galleryId: gallery.id, descriptionId: description.id, type },
  });

  try {
    await enqueueGeneration({ jobId: job.id, descriptionId: description.id, type });
  } catch (err) {
    const message = 'Черга генерації недоступна. Спробуйте пізніше.';
    await prisma.$transaction([
      prisma.description.update({ where: { id: description.id }, data: { status: 'failed', error: message } }),
      prisma.generationJob.update({
        where: { id: job.id },
        data: { status: 'failed', error: String(err).slice(0, 500), finishedAt: new Date() },
      }),
    ]);
    return { ok: false, status: 503, message };
  }
  return { ok: true, started: true };
}
