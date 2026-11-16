import { NextResponse } from 'next/server';
import { storageKeys, updateGallerySchema } from '@canvascast/core';
import { prisma } from '@canvascast/db';
import { deletePrefix } from '@canvascast/storage';
import { NOT_FOUND, baseUrl, findGalleryForEdit, jsonError, readJson } from '@/lib/api';
import { editorGallery } from '@/lib/dto';

type Ctx = { params: Promise<{ editToken: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const gallery = await findGalleryForEdit((await params).editToken);
  if (!gallery) return NOT_FOUND();
  return NextResponse.json(await editorGallery(gallery, baseUrl(req)), {
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const gallery = await findGalleryForEdit((await params).editToken);
  if (!gallery) return NOT_FOUND();

  const parsed = updateGallerySchema.safeParse(await readJson(req));
  if (!parsed.success) return jsonError(400, 'Некоректні дані галереї');

  const updated = await prisma.gallery.update({
    where: { id: gallery.id },
    data: { ...parsed.data, version: { increment: 1 } },
  });
  return NextResponse.json(await editorGallery(updated, baseUrl(req)));
}

/** Повне видалення галереї з усіма файлами (право на видалення даних). */
export async function DELETE(_req: Request, { params }: Ctx) {
  const gallery = await findGalleryForEdit((await params).editToken);
  if (!gallery) return NOT_FOUND();

  await prisma.gallery.delete({ where: { id: gallery.id } });
  await deletePrefix(storageKeys.galleryPrefix(gallery.id)).catch((err) =>
    console.error('[storage] не вдалося прибрати файли галереї', gallery.id, err),
  );
  return new NextResponse(null, { status: 204 });
}
