'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, jsonBody, readKnownGalleries, rememberGallery, type KnownGallery } from '@/lib/client';

export function CreateGalleryForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [lang, setLang] = useState<'uk' | 'en'>('uk');
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [known, setKnown] = useState<KnownGallery[]>([]);

  useEffect(() => setKnown(readKnownGalleries()), []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { editToken } = await api<{ editToken: string }>(
        '/api/galleries',
        jsonBody('POST', { name, lang, rightsConfirmed: rights }),
      );
      rememberGallery({ name: name.trim(), editToken, createdAt: Date.now() });
      router.push(`/e/${editToken}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не вдалося створити галерею');
      setBusy(false);
    }
  }

  return (
    <>
      <form onSubmit={submit} className="mt-4 space-y-5">
        <div>
          <label htmlFor="gallery-name" className="label">
            Назва галереї
          </label>
          <input
            id="gallery-name"
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={120}
            autoComplete="organization"
          />
        </div>

        <div>
          <label htmlFor="gallery-lang" className="label">
            Мова описів
          </label>
          <select
            id="gallery-lang"
            className="field"
            value={lang}
            onChange={(e) => setLang(e.target.value as 'uk' | 'en')}
          >
            <option value="uk">Українська</option>
            <option value="en">English</option>
          </select>
        </div>

        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 size-6 shrink-0 accent-(--accent)"
            checked={rights}
            onChange={(e) => setRights(e.target.checked)}
            required
          />
          <span>
            Підтверджую, що маю право завантажувати зображення цих картин і відповідаю за
            опубліковані описи.
          </span>
        </label>

        <div role="alert" className="font-medium text-danger empty:hidden">
          {error}
        </div>

        <button type="submit" className="btn btn-primary w-full" disabled={busy}>
          {busy ? 'Створюємо…' : 'Створити галерею'}
        </button>
        <p className="hint">Без реєстрації: ви отримаєте секретне посилання для редагування.</p>
      </form>

      {known.length > 0 && (
        <section aria-labelledby="known-heading" className="mt-10">
          <h3 id="known-heading" className="text-lg">
            Ваші галереї на цьому пристрої
          </h3>
          <ul className="mt-2 border-t border-line">
            {known.map((g) => (
              <li key={g.editToken} className="border-b border-line">
                <a
                  className="flex min-h-12 items-center justify-between gap-3 py-2 text-ink no-underline hover:text-accent"
                  href={`/e/${g.editToken}`}
                >
                  <span className="min-w-0 truncate">{g.name || 'Галерея без назви'}</span>
                  <span aria-hidden="true">→</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
