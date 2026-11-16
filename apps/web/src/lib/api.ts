import { NextResponse } from 'next/server';
import { env, isWellFormedToken } from '@canvascast/core';
import { prisma, type Gallery } from '@canvascast/db';
import { rateLimit } from '@canvascast/queue';

export function jsonError(status: number, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'local';
}

/** Адреса застосунку для посилань і QR: APP_URL або те, як до нас звернулися. */
export function baseUrl(req: Request): string {
  if (env.appUrl) return env.appUrl;
  const url = new URL(req.url);
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? url.host;
  const proto = req.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '');
  return `${proto}://${host}`;
}

/** Повертає відповідь 429, якщо ліміт вичерпано; інакше null. */
export async function limited(key: string, limit: number, windowSec: number) {
  const allowed = await rateLimit(key, limit, windowSec);
  return allowed ? null : jsonError(429, 'Забагато запитів. Спробуйте трохи пізніше.');
}

/** Галерея за секретним токеном редагування — єдина «авторизація» власника. */
export async function findGalleryForEdit(editToken: string): Promise<Gallery | null> {
  if (!isWellFormedToken(editToken)) return null;
  return prisma.gallery.findUnique({ where: { editToken } });
}

export const NOT_FOUND = () => jsonError(404, 'Галерею не знайдено');

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
