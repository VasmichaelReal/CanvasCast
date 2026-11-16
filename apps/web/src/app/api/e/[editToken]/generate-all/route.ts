import { NextResponse } from 'next/server';
import { prisma } from '@canvascast/db';
import { NOT_FOUND, baseUrl, findGalleryForEdit, jsonError, limited } from '@/lib/api';
import { editorGallery } from '@/lib/dto';
import { startGeneration } from '@/lib/generation';

type Ctx = { params: Promise<{ editToken: string }> };

/** «Згенерувати описи»: запускає генерацію для всіх картин, які ще не мають готового опису. */
export async function POST(req: Request, { params }: Ctx) {
  const gallery = await findGalleryForEdit((await params).editToken);
  if (!gallery) return NOT_FOUND();

  const blocked = await limited(`generate-all:${gallery.id}`, 10, 600);
  if (blocked) return blocked;

  const paintings = await prisma.painting.findMany({
    where: { galleryId: gallery.id },
    orderBy: { position: 'asc' },
    include: { descriptions: { where: { lang: gallery.lang } } },
  });
  const todo = paintings.filter((p) => p.descriptions[0]?.status !== 'ready');

  let started = 0;
  let problem: { status: number; message: string } | null = null;
  for (const painting of todo) {
    const result = await startGeneration(gallery, painting.id, 'full');
    if (!result.ok) {
      problem = result;
      break; // ліміт або недоступна черга — далі пробувати марно
    }
    if (result.started) started++;
  }
  if (problem && started === 0) return jsonError(problem.status, problem.message);

  return NextResponse.json(
    { started, warning: problem?.message ?? null, gallery: await editorGallery(gallery, baseUrl(req)) },
    { status: 202 },
  );
}
