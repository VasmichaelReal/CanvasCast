import { NextResponse } from 'next/server';
import { isWellFormedToken } from '@canvascast/core';
import { prisma } from '@canvascast/db';
import { NOT_FOUND } from '@/lib/api';
import { publicGallery } from '@/lib/dto';

type Ctx = { params: Promise<{ viewToken: string }> };

/**
 * Публічні дані галереї. Ця ж відповідь слугує офлайн-маніфестом: у ній є
 * версія та адреси всіх медіафайлів, які треба зберегти на пристрої.
 */
export async function GET(_req: Request, { params }: Ctx) {
  const { viewToken } = await params;
  if (!isWellFormedToken(viewToken)) return NOT_FOUND();

  const gallery = await prisma.gallery.findUnique({ where: { viewToken } });
  if (!gallery || gallery.blocked) return NOT_FOUND();

  return NextResponse.json(await publicGallery(gallery), { headers: { 'Cache-Control': 'no-store' } });
}
