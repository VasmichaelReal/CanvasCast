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
