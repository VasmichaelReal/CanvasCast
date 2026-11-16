import { NextResponse } from 'next/server';
import { storageKeys, updatePaintingSchema } from '@canvascast/core';
import { prisma } from '@canvascast/db';
import { deletePrefix } from '@canvascast/storage';
import { NOT_FOUND, baseUrl, findGalleryForEdit, jsonError, readJson } from '@/lib/api';
import { editorGallery } from '@/lib/dto';
import { startGeneration } from '@/lib/generation';

type Ctx = { params: Promise<{ editToken: string; id: string }> };

/** Відомості про картину (автор, рік, техніка, контекст) та порядок у списку. */
export async function PATCH(req: Request, { params }: Ctx) {
  const { editToken, id } = await params;
  const gallery = await findGalleryForEdit(editToken);
  if (!gallery) return NOT_FOUND();

  const painting = await prisma.painting.findFirst({ where: { id, galleryId: gallery.id } });
  if (!painting) return jsonError(404, 'Картину не знайдено');

  const parsed = updatePaintingSchema.safeParse(await readJson(req));
  if (!parsed.success) return jsonError(400, 'Некоректні відомості про картину');
  const { move, ...facts } = parsed.data;

  await prisma.$transaction(async (tx) => {
    if (Object.keys(facts).length > 0) {
      await tx.painting.update({ where: { id }, data: facts });
    }
    if (move) {
      const neighbour = await tx.painting.findFirst({
        where: {
          galleryId: gallery.id,
          position: move < 0 ? { lt: painting.position } : { gt: painting.position },
        },
        orderBy: { position: move < 0 ? 'desc' : 'asc' },
      });
      if (neighbour) {
        await tx.painting.update({ where: { id }, data: { position: neighbour.position } });
        await tx.painting.update({ where: { id: neighbour.id }, data: { position: painting.position } });
      }
    }
    await tx.gallery.update({ where: { id: gallery.id }, data: { version: { increment: 1 } } });
  });

  // Назва, автор, рік і техніка звучать у вступі до аудіо. Якщо їх змінили, а опис уже
  // озвучено — переозвучуємо, щоб запис не розходився з відомостями.
  const spoken = ['title', 'author', 'year', 'technique'] as const;
  if (spoken.some((key) => key in facts && facts[key] !== painting[key])) {
    const description = await prisma.description.findUnique({
      where: { paintingId_lang: { paintingId: id, lang: gallery.lang } },
    });
    if (description?.status === 'ready' && description.text) {
      await startGeneration(gallery, id, 'tts');
    }
  }

  return NextResponse.json(await editorGallery(gallery, baseUrl(req)));
}

/** Видалення картини. Підтвердження запитує інтерфейс; тут — безповоротна дія. */
export async function DELETE(req: Request, { params }: Ctx) {
  const { editToken, id } = await params;
  const gallery = await findGalleryForEdit(editToken);
  if (!gallery) return NOT_FOUND();

  const painting = await prisma.painting.findFirst({ where: { id, galleryId: gallery.id } });
  if (!painting) return jsonError(404, 'Картину не знайдено');

  await prisma.$transaction([
    prisma.painting.delete({ where: { id } }),
    prisma.gallery.update({ where: { id: gallery.id }, data: { version: { increment: 1 } } }),
  ]);
  await deletePrefix(storageKeys.paintingPrefix(gallery.id, id)).catch((err) =>
    console.error('[storage] не вдалося прибрати файли картини', id, err),
  );
  return NextResponse.json(await editorGallery(gallery, baseUrl(req)));
}
