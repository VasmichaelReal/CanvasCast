import { NextResponse } from 'next/server';
import { createGallerySchema, generateToken } from '@canvascast/core';
import { prisma } from '@canvascast/db';
import { clientIp, jsonError, limited, readJson } from '@/lib/api';

/** Створення галереї без реєстрації. Повертає обидва токени — єдиний раз. */
export async function POST(req: Request) {
  const blocked = await limited(`create:${clientIp(req)}`, 10, 3600);
  if (blocked) return blocked;

  const parsed = createGallerySchema.safeParse(await readJson(req));
  if (!parsed.success) {
    return jsonError(400, 'Вкажіть назву галереї та підтвердьте право на зображення.');
  }

  const gallery = await prisma.gallery.create({
    data: {
      name: parsed.data.name,
      lang: parsed.data.lang,
      viewToken: generateToken(),
      editToken: generateToken(),
      rightsConfirmedAt: new Date(),
    },
  });
  return NextResponse.json({ viewToken: gallery.viewToken, editToken: gallery.editToken }, { status: 201 });
}
