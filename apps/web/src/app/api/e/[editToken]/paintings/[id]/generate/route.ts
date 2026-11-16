import { NextResponse } from 'next/server';
import { NOT_FOUND, baseUrl, findGalleryForEdit, jsonError, limited } from '@/lib/api';
import { editorGallery } from '@/lib/dto';
import { startGeneration } from '@/lib/generation';

type Ctx = { params: Promise<{ editToken: string; id: string }> };

/** (Пере)генерація опису й озвучення однієї картини. */
export async function POST(req: Request, { params }: Ctx) {
  const { editToken, id } = await params;
  const gallery = await findGalleryForEdit(editToken);
  if (!gallery) return NOT_FOUND();

  const blocked = await limited(`generate:${gallery.id}`, 80, 600);
  if (blocked) return blocked;

  const result = await startGeneration(gallery, id, 'full');
  if (!result.ok) return jsonError(result.status, result.message);
  return NextResponse.json(await editorGallery(gallery, baseUrl(req)), { status: 202 });
}
