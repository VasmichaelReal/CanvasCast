import { NextResponse } from 'next/server';
import { updateDescriptionSchema } from '@canvascast/core';
import { prisma } from '@canvascast/db';
import { NOT_FOUND, baseUrl, findGalleryForEdit, jsonError, limited, readJson } from '@/lib/api';
import { editorGallery } from '@/lib/dto';
import { startGeneration } from '@/lib/generation';

type Ctx = { params: Promise<{ editToken: string; id: string }> };

/**
 * Ручне редагування тексту опису. Після збереження аудіо переозвучується
 * автоматично, щоб звук завжди відповідав тексту.
 */
export async function PATCH(req: Request, { params }: Ctx) {
  const { editToken, id } = await params;
  const gallery = await findGalleryForEdit(editToken);
  if (!gallery) return NOT_FOUND();

  const description = await prisma.description.findFirst({
    where: { id, painting: { galleryId: gallery.id } },
  });
  if (!description) return jsonError(404, 'Опис не знайдено');

  const parsed = updateDescriptionSchema.safeParse(await readJson(req));
  if (!parsed.success) return jsonError(400, 'Текст опису порожній або задовгий');

  if (parsed.data.text !== description.text) {
    const blocked = await limited(`generate:${gallery.id}`, 80, 600);
    if (blocked) return blocked;

    await prisma.$transaction([
      prisma.description.update({
        where: { id },
        // Власник перевірив текст — позначки невпевненості моделі більше не актуальні.
        data: { text: parsed.data.text, textEdited: true, uncertain: [] },
      }),
      prisma.gallery.update({ where: { id: gallery.id }, data: { version: { increment: 1 } } }),
    ]);
    const result = await startGeneration(gallery, description.paintingId, 'tts');
    if (!result.ok) {
      return jsonError(result.status, `Текст збережено, але озвучити не вдалося: ${result.message}`);
    }
  }
  return NextResponse.json(await editorGallery(gallery, baseUrl(req)));
}
