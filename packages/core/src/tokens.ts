import { randomBytes } from 'node:crypto';

/** 192 біти ентропії, URL-безпечний рядок із 32 символів. */
export function generateToken(): string {
  return randomBytes(24).toString('base64url');
}

const TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;

/** Дешева перевірка форми до звернення в БД: відсікає сміття й перебір короткими рядками. */
export function isWellFormedToken(value: unknown): value is string {
  return typeof value === 'string' && TOKEN_RE.test(value);
}
