'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  api,
  importKnownGalleries,
  jsonBody,
  readKnownGalleries,
  rememberGallery,
  saveTextFile,
  serializeKnownGalleries,
  type KnownGallery,
} from '@/lib/client';

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

      <TransferList known={known} onChange={setKnown} />
    </>
  );
}

/** Перенесення списку галерей між пристроями файлом — без облікових записів. */
function TransferList({ known, onChange }: { known: KnownGallery[]; onChange: (list: KnownGallery[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  function exportList() {
    const date = new Date().toISOString().slice(0, 10);
    saveTextFile(`canvascast-galleries-${date}.json`, serializeKnownGalleries(known));
    setMessage({ text: `Файл зі списком збережено (галерей: ${known.length}).`, error: false });
  }

  async function importList(file: File | undefined) {
    if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw new Error('Файл завеликий для списку галерей.');
      const { list, added } = importKnownGalleries(await file.text());
      onChange(list);
      setMessage({
        text: added > 0 ? `Додано галерей: ${added}.` : 'Усі галереї з файлу вже є в списку.',
        error: false,
      });
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : 'Не вдалося прочитати файл.', error: true });
    } finally {
      if (input.current) input.current.value = '';
    }
  }

  return (
    <section aria-labelledby="transfer-heading" className={known.length > 0 ? 'mt-6' : 'mt-10'}>
      <h3 id="transfer-heading" className={known.length > 0 ? 'sr-only' : 'text-lg'}>
        Перенести список галерей
      </h3>
      <div className="flex flex-wrap gap-3">
        {known.length > 0 && (
          <button type="button" className="btn" onClick={exportList}>
            Експортувати список
          </button>
        )}
        <button type="button" className="btn" onClick={() => input.current?.click()}>
          Імпортувати список
        </button>
        <input
          ref={input}
          type="file"
          accept=".json,.txt,application/json,text/plain"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => void importList(e.target.files?.[0])}
        />
      </div>
      <p className="hint mt-2">
        {known.length > 0
          ? 'Щоб відкрити ці галереї на іншому пристрої, збережіть файл і імпортуйте його там. Файл містить секретні посилання для редагування — не пересилайте його стороннім.'
          : 'Створювали галереї на іншому пристрої? Імпортуйте файл зі списком або текстовий файл із посиланнями на редактор.'}
      </p>
      <p role="status" className={`mt-2 font-medium empty:hidden ${message?.error ? 'text-danger' : ''}`}>
        {message?.text}
      </p>
    </section>
  );
}
