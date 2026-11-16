/** Дрібні помічники для клієнтських компонентів. */

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(
      (data as { error?: string } | null)?.error ?? `Помилка сервера (${res.status})`,
      res.status,
      data,
    );
  }
  return data as T;
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly data: unknown) {
    super(message);
  }
}

export const jsonBody = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

export function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(totalSeconds) ? totalSeconds : 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Галереї, створені на цьому пристрої: страховка на випадок втраченого посилання. */
export interface KnownGallery {
  name: string;
  editToken: string;
  createdAt: number;
}

const KNOWN_KEY = 'cc-my-galleries';

export function readKnownGalleries(): KnownGallery[] {
  try {
    const list = JSON.parse(localStorage.getItem(KNOWN_KEY) ?? '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function rememberGallery(entry: KnownGallery): void {
  try {
    const rest = readKnownGalleries().filter((g) => g.editToken !== entry.editToken);
    localStorage.setItem(KNOWN_KEY, JSON.stringify([entry, ...rest].slice(0, 30)));
  } catch {
    /* сховище недоступне (приватний режим) — не критично */
  }
}

export function forgetGallery(editToken: string): void {
  try {
    const rest = readKnownGalleries().filter((g) => g.editToken !== editToken);
    localStorage.setItem(KNOWN_KEY, JSON.stringify(rest));
  } catch {
    /* ignore */
  }
}

/* ───────────── Підготовка фото до завантаження ───────────── */

/** Безкоштовні хостинги обмежують тіло запиту (Vercel — 4,5 МБ), тому більші фото стискаємо в браузері. */
export const UPLOAD_TARGET_BYTES = 3.5 * 1024 * 1024;
const UPLOAD_MAX_SIDE = 2400; // сервер однаково зменшує до цього розміру

/**
 * Повертає файл, готовий до відправки: малі — без змін, великі — зменшені й
 * перекодовані в JPEG. Якщо браузер не зміг прочитати зображення, повертає
 * оригінал: сервер перевірить його сам і пояснить відмову.
 */
export async function prepareImageForUpload(file: File): Promise<Blob> {
  if (file.size <= UPLOAD_TARGET_BYTES) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    try {
      let scale = Math.min(1, UPLOAD_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
      for (let attempt = 0; attempt < 6; attempt++) {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) return file;
        ctx.fillStyle = '#ffffff'; // прозорі ділянки PNG стають білими, як і на сервері
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const quality = attempt < 3 ? 0.9 - attempt * 0.08 : 0.74;
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, 'image/jpeg', quality),
        );
        if (!blob) return file;
        if (blob.size <= UPLOAD_TARGET_BYTES) return blob;
        if (attempt >= 2) scale *= 0.8;
      }
    } finally {
      bitmap.close();
    }
  } catch {
    /* не вдалося декодувати — нехай вирішує сервер */
  }
  return file;
}

/* ───────────── Скачування аудіо й тексту ───────────── */

/** Безпечне ім'я файлу з назви картини. */
export function downloadFileName(title: string, ext: string): string {
  const base = title
    .normalize('NFC')
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
    .slice(0, 80);
  return `${base || 'canvascast'}.${ext}`;
}

export function audioExtension(audioUrl: string): string {
  return /\.([a-z0-9]{2,4})$/i.exec(audioUrl)?.[1]?.toLowerCase() ?? 'mp3';
}

/** Текст опису у вигляді, придатному для збереження у файл і читання читачем екрана. */
export function descriptionAsText(p: {
  title: string;
  author?: string | null;
  year?: string | null;
  technique?: string | null;
  text: string;
}): string {
  const meta = [p.author, p.year, p.technique].filter(Boolean).join(', ');
  const body = p.text
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join('\n\n');
  return [p.title, meta, '', body, ''].filter((line, i) => i !== 1 || line).join('\n');
}

/** Зберігає текст як .txt-файл (працює й без інтернету). */
export function saveTextFile(fileName: string, content: string): void {
  // BOM — щоб кирилицю правильно відкривали старі редактори Windows.
  const url = URL.createObjectURL(new Blob(['﻿', content], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
