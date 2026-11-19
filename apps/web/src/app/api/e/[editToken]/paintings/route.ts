import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { MAX_FILES_PER_UPLOAD, env, paintingFactsSchema, storageKeys, type PaintingFactsInput } from '@canvascast/core';
import { prisma } from '@canvascast/db';
import { putObject } from '@canvascast/storage';
import { NOT_FOUND, baseUrl, clientIp, findGalleryForEdit, jsonError, limited } from '@/lib/api';
import { editorGallery } from '@/lib/dto';
import { processUpload } from '@/lib/images';

type Ctx = { params: Promise<{ editToken: string }> };

/**
 * Завантаження одного чи кількох зображень (multipart, поле "files").
 * Необов'язкове поле "facts" (JSON) — відомості про картину; лише для одного файлу
 * (так додає картки імпорт із документа).
 */
export async function POST(req: Request, { params }: Ctx) {
  const gallery = await findGalleryForEdit((await params).editToken);
  if (!gallery) return NOT_FOUND();

  // Редактор надсилає по одному файлу на запит, тож ліміт рахує файли.
  const blocked = await limited(`upload:${clientIp(req)}`, 150, 600);
  if (blocked) return blocked;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError(400, 'Очікується форма з файлами');
  }
  const files = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return jsonError(400, 'Не вибрано жодного файлу');
  if (files.length > MAX_FILES_PER_UPLOAD) {
    return jsonError(400, `За один раз можна завантажити до ${MAX_FILES_PER_UPLOAD} зображень`);
  }

  let facts: PaintingFactsInput = {};
  const rawFacts = form.get('facts');
  if (typeof rawFacts === 'string' && rawFacts) {
    if (files.length !== 1) return jsonError(400, 'Відомості можна передати лише для одного зображення');
    let json: unknown = null;
    try {
      json = JSON.parse(rawFacts);
    } catch {
      /* перевірить схема */
    }
    const parsed = paintingFactsSchema.safeParse(json);
    if (!parsed.success) return jsonError(400, 'Некоректні відомості про картину');
    facts = parsed.data;
  }

  const existing = await prisma.painting.aggregate({
    where: { galleryId: gallery.id },
    _count: true,
    _max: { position: true },
  });
  if (existing._count + files.length > env.maxPaintingsPerGallery) {
    return jsonError(400, `У галереї може бути до ${env.maxPaintingsPerGallery} картин`);
  }

  let position = existing._max.position ?? 0;
  let added = 0;
  const rejected: Array<{ name: string; reason: string }> = [];
  const maxMb = Math.round(env.maxUploadBytes / 1024 / 1024);

  // Послідовно: обробка зображень важка для пам'яті, а порядок файлів важливий.
  for (const file of files) {
    if (file.size > env.maxUploadBytes) {
      rejected.push({ name: file.name, reason: `Файл більший за ${maxMb} МБ` });
      continue;
    }
    try {
      const { image, thumb } = await processUpload(Buffer.from(await file.arrayBuffer()));
      const id = randomUUID();
      const imageKey = storageKeys.image(gallery.id, id);
      const thumbKey = storageKeys.thumb(gallery.id, id);
      await Promise.all([
        putObject(imageKey, image, 'image/jpeg'),
        putObject(thumbKey, thumb, 'image/jpeg'),
      ]);
      await prisma.painting.create({
        data: { id, galleryId: gallery.id, position: ++position, imageKey, thumbKey, ...facts },
      });
      added++;
    } catch (err) {
      rejected.push({
        name: file.name,
        reason: err instanceof Error ? err.message : 'Не вдалося зберегти файл',
      });
    }
  }

  return NextResponse.json(
    { added, rejected, gallery: await editorGallery(gallery, baseUrl(req)) },
    { status: added > 0 ? 201 : 400 },
  );
}
