'use client';

import { useEffect, useRef, useState } from 'react';
import type { ImportResult } from '@canvascast/core';
import type { EditorGallery } from '@/lib/dto';
import { ApiError, api, jsonBody, prepareImageForUpload } from '@/lib/client';
import { DocumentError, IMPORT_ACCEPT, readDocument } from '@/lib/documents';

type FactKey = 'title' | 'author' | 'year' | 'technique' | 'context';
type Facts = Record<FactKey, string>;

interface Draft {
  key: string;
  facts: Facts;
  image: Blob | null;
  imageName: string;
  previewUrl: string | null;
  /** 'new' — нова картина; інакше id наявної картини, чиї відомості заповнюємо. */
  target: string;
  error: string | null;
}

const FIELDS = [
  { key: 'title', label: 'Назва', max: 200 },
  { key: 'author', label: 'Автор', max: 200 },
  { key: 'year', label: 'Рік', max: 60 },
  { key: 'technique', label: 'Техніка', max: 200 },
] as const;

const normalize = (s: string | null | undefined) => (s ?? '').toLocaleLowerCase('uk').replace(/[«»"“”'’\s]+/g, ' ').trim();

let draftSeq = 0;

export function ImportSection({
  gallery,
  base,
  onGallery,
  announce,
}: {
  gallery: EditorGallery;
  base: string;
  onGallery: (g: EditorGallery) => void;
  announce: (message: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const urls = useRef(new Set<string>());
  const [phase, setPhase] = useState<'idle' | 'reading' | 'thinking' | 'saving'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [progress, setProgress] = useState('');
  const [summary, setSummary] = useState<string | null>(null);
  const busy = phase !== 'idle';

  const preview = (blob: Blob | null) => {
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    urls.current.add(url);
    return url;
  };
  const release = (url: string | null) => {
    if (!url) return;
    URL.revokeObjectURL(url);
    urls.current.delete(url);
  };

  useEffect(() => {
    const all = urls.current;
    return () => all.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  // Неперевірені картки живуть лише в цій вкладці — попереджаємо перед закриттям.
  useEffect(() => {
    if (drafts.length === 0) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [drafts.length]);

  function clearDrafts() {
    drafts.forEach((d) => release(d.previewUrl));
    setDrafts([]);
    setNotes([]);
  }

  async function importFile(file: File | undefined) {
    if (!file) return;
    if (drafts.length > 0 && !window.confirm('Замінити картки попереднього імпорту новими?')) {
      if (input.current) input.current.value = '';
      return;
    }
    clearDrafts();
    setError(null);
    setSummary(null);
    setPhase('reading');
    try {
      const doc = await readDocument(file);
      const form = new FormData();
      form.append('fileName', file.name);
      let images: Array<{ name: string; blob: Blob }> = [];
      if (doc.kind === 'text') {
        form.append('text', doc.text);
        form.append('imageCount', String(doc.images.length));
        images = doc.images;
      } else {
        form.append('file', doc.blob, file.name);
      }

      setPhase('thinking');
      announce('Документ надіслано, модель розпізнає картини');
      const result = await api<ImportResult>(`${base}/import`, { method: 'POST', body: form });

      const byTitle = new Map(gallery.paintings.filter((p) => p.title).map((p) => [normalize(p.title), p.id]));
      const used = new Set<string>();
      const next = result.paintings.map((p): Draft => {
        const image = p.imageIndex ? (images[p.imageIndex - 1] ?? null) : null;
        // Якщо фото в документі немає, а картина з такою назвою вже є — пропонуємо заповнити її.
        const match = !image ? byTitle.get(normalize(p.title)) : undefined;
        const target = match && !used.has(match) ? match : 'new';
        if (target !== 'new') used.add(target);
        return {
          key: `d${++draftSeq}`,
          facts: { title: p.title, author: p.author, year: p.year, technique: p.technique, context: p.context },
          image: image?.blob ?? null,
          imageName: image?.name ?? '',
          previewUrl: preview(image?.blob ?? null),
          target,
          error: null,
        };
      });

      const extra = doc.kind === 'text' && doc.truncated ? ['Документ дуже великий — модель прочитала лише його початок.'] : [];
      setNotes([...extra, ...result.notes]);
      setDrafts(next);
      const message = next.length
        ? `Знайдено картин: ${next.length}. Перевірте картки нижче й додайте їх до галереї.`
        : 'У документі не знайдено картин.';
      setSummary(message);
      announce(message);
    } catch (err) {
      const message =
        err instanceof DocumentError || err instanceof ApiError
          ? err.message
          : err instanceof Error && err.name === 'TypeError'
            ? 'Немає зв’язку із сервером. Перевірте інтернет і спробуйте знову.'
            : 'Не вдалося прочитати документ.';
      setError(err instanceof ApiError && err.status === 413 ? 'Документ завеликий для завантаження.' : message);
      announce('Помилка імпорту');
    } finally {
      setPhase('idle');
      if (input.current) input.current.value = '';
    }
  }

  const update = (key: string, patch: Partial<Draft>) =>
    setDrafts((list) => list.map((d) => (d.key === key ? { ...d, ...patch, error: null } : d)));

  function setImage(key: string, file: File | undefined) {
    if (!file) return;
    const draft = drafts.find((d) => d.key === key);
    release(draft?.previewUrl ?? null);
    update(key, { image: file, imageName: file.name, previewUrl: preview(file), target: 'new' });
  }

  function remove(key: string) {
    const draft = drafts.find((d) => d.key === key);
    release(draft?.previewUrl ?? null);
    setDrafts((list) => list.filter((d) => d.key !== key));
    announce(`Картку прибрано: ${draft?.facts.title || 'без назви'}`);
  }

  // Звичний сценарій: фото вже завантажені, а документ — підписи до них у тому ж порядку.
  const unnamed = gallery.paintings.filter((p) => !p.title);
  const photoless = drafts.filter((d) => !d.image && d.target === 'new');
  function matchInOrder() {
    const taken = new Set(drafts.map((d) => d.target));
    const free = unnamed.filter((p) => !taken.has(p.id));
    let i = 0;
    setDrafts((list) =>
      list.map((d) => (!d.image && d.target === 'new' && i < free.length ? { ...d, target: free[i++]!.id, error: null } : d)),
    );
    announce(`Зіставлено з наявними картинами: ${Math.min(photoless.length, free.length)}`);
  }

  function validate(list: Draft[]): Draft[] {
    const targets = new Map<string, number>();
    list.forEach((d) => d.target !== 'new' && targets.set(d.target, (targets.get(d.target) ?? 0) + 1));
    return list.map((d) => ({
      ...d,
      error:
        d.target === 'new' && !d.image
          ? 'Додайте фото картини або виберіть наявну картину, до якої належать ці відомості.'
          : d.target !== 'new' && (targets.get(d.target) ?? 0) > 1
            ? 'Цю картину вибрано в кількох картках.'
            : null,
    }));
  }

  async function commit() {
    const checked = validate(drafts);
    const invalid = checked.filter((d) => d.error).length;
    if (invalid) {
      setDrafts(checked);
      setError(`Перевірте картки з позначками (${invalid}).`);
      announce(`Не всі картки готові: ${invalid}`);
      return;
    }
    setError(null);
    setPhase('saving');
    let done = 0;
    const remaining: Draft[] = [];
    for (const [i, d] of checked.entries()) {
      setProgress(`Додаємо ${i + 1} з ${checked.length}…`);
      try {
        if (d.target === 'new') {
          const form = new FormData();
          form.append('files', await prepareImageForUpload(d.image!), d.imageName || 'image.jpg');
          form.append('facts', JSON.stringify(d.facts));
          const res = await api<{ added: number; rejected: Array<{ reason: string }>; gallery: EditorGallery }>(
            `${base}/paintings`,
            { method: 'POST', body: form },
          );
          onGallery(res.gallery);
          if (res.added === 0) throw new Error(res.rejected[0]?.reason ?? 'Не вдалося додати картину');
        } else {
          // Порожні поля картки не стирають того, що вже заповнено в наявній картині.
          const filled = Object.fromEntries(Object.entries(d.facts).filter(([, v]) => v.trim()));
          if (Object.keys(filled).length > 0) {
            onGallery(await api<EditorGallery>(`${base}/paintings/${d.target}`, jsonBody('PATCH', filled)));
          }
        }
        release(d.previewUrl);
        done++;
      } catch (err) {
        const data = err instanceof ApiError ? (err.data as { rejected?: Array<{ reason: string }> } | null) : null;
        remaining.push({
          ...d,
          error: data?.rejected?.[0]?.reason ?? (err instanceof Error ? err.message : 'Не вдалося додати картину'),
        });
      }
    }
    setDrafts(remaining);
    if (remaining.length === 0) setNotes([]);
    const message = remaining.length
      ? `Додано: ${done}. Не вдалося: ${remaining.length} — див. картки нижче.`
      : `Додано до галереї: ${done}. Тепер можна згенерувати описи.`;
    setSummary(message);
    announce(message);
    setProgress('');
    setPhase('idle');
  }

  const status =
    phase === 'reading'
      ? 'Читаємо документ…'
      : phase === 'thinking'
        ? 'Модель розпізнає картини в документі… Це може тривати хвилину-дві.'
        : phase === 'saving'
          ? progress || 'Додаємо картини…'
          : summary;

  return (
    <section aria-labelledby="import-heading" className="card mt-6">
      <h2 id="import-heading" className="text-2xl font-bold">
        Імпорт із документа
      </h2>
      <p className="hint mt-1">
        Каталог, експлікація, таблиця чи презентація: модель випише з документа назви, авторів,
        роки, техніку й контекст і заповнить картки картин. Фото з документа підставляються
        автоматично. Перед додаванням ви перевірите й виправите кожну картку — описи генеруються
        лише тоді, коли ви їх запустите.
      </p>
      <label htmlFor="import-input" className="label mt-4">
        Документ
      </label>
      <input
        ref={input}
        id="import-input"
        type="file"
        accept={IMPORT_ACCEPT}
        disabled={busy}
        aria-describedby="import-hint"
        onChange={(e) => void importFile(e.target.files?.[0])}
        className="field file:mr-4 file:cursor-pointer file:rounded-md file:border-0 file:bg-accent file:px-4 file:py-2 file:font-semibold file:text-accent-ink"
      />
      <p id="import-hint" className="hint mt-2">
        DOCX, ODT, PPTX, XLSX, ODS, PDF (до 4 МБ), CSV, TXT або Markdown. Модель може помилятися —
        звіряйте відомості з документом.
      </p>

      <div role="status" className="mt-3 font-semibold empty:hidden">
        {status}
      </div>
      <div role="alert" className="mt-2 font-semibold text-danger empty:hidden">
        {error}
      </div>

      {notes.length > 0 && (
        <div className="notice mt-4">
          <p className="font-semibold">Зверніть увагу:</p>
          <ul className="mt-1 list-disc pl-6">
            {notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}

      {drafts.length > 0 && (
        <>
          {photoless.length > 0 && unnamed.length > 0 && (
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button type="button" className="btn" onClick={matchInOrder} disabled={busy}>
                Зіставити з наявними фото по порядку
              </button>
              <p className="hint">
                Картки без фото ({photoless.length}) по черзі заповнять відомості картин без назви (
                {unnamed.length}).
              </p>
            </div>
          )}

          <h3 className="mt-6 text-xl font-bold">Картки на перевірку ({drafts.length})</h3>
          <ol className="mt-3 space-y-5">
            {drafts.map((d, i) => (
              <li key={d.key}>
                <DraftCard
                  draft={d}
                  index={i}
                  gallery={gallery}
                  disabled={busy}
                  onChange={(patch) => update(d.key, patch)}
                  onImage={(f) => setImage(d.key, f)}
                  onRemove={() => remove(d.key)}
                />
              </li>
            ))}
          </ol>

          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" className="btn btn-primary" onClick={() => void commit()} disabled={busy}>
              {phase === 'saving' ? 'Додаємо…' : `Додати до галереї (${drafts.length})`}
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => {
                if (!window.confirm('Скасувати імпорт? Картки буде відкинуто.')) return;
                clearDrafts();
                setSummary(null);
                setError(null);
                announce('Імпорт скасовано');
              }}
            >
              Скасувати імпорт
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function DraftCard({
  draft: d,
  index,
  gallery,
  disabled,
  onChange,
  onImage,
  onRemove,
}: {
  draft: Draft;
  index: number;
  gallery: EditorGallery;
  disabled: boolean;
  onChange: (patch: Partial<Draft>) => void;
  onImage: (file: File | undefined) => void;
  onRemove: () => void;
}) {
  const uid = `imp-${d.key}`;
  const name = d.facts.title || `Картка ${index + 1}`;
  const existing = gallery.paintings.find((p) => p.id === d.target);
  const setFact = (key: FactKey, value: string) => onChange({ facts: { ...d.facts, [key]: value } });

  return (
    <article aria-labelledby={`${uid}-title`} className={`rounded-lg border-2 p-4 ${d.error ? 'border-danger' : 'border-line'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h4 id={`${uid}-title`} className="text-lg font-bold">
          {index + 1}. {name}
        </h4>
        <button type="button" className="btn" onClick={onRemove} disabled={disabled} aria-label={`Прибрати картку: ${name}`}>
          Прибрати
        </button>
      </div>

      <div className="mt-3 grid gap-4 md:grid-cols-[12rem_1fr]">
        <div>
          {d.target === 'new' && d.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={d.previewUrl}
              alt={`Фото для картки: ${name}`}
              className="max-h-56 w-full rounded-lg border border-line object-contain md:w-48"
            />
          ) : existing ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={existing.thumbUrl}
              alt={`Фото наявної картини, яку буде заповнено: ${existing.title || name}`}
              className="max-h-56 w-full rounded-lg border border-line object-contain md:w-48"
            />
          ) : (
            <p className="hint rounded-lg border border-dashed border-line p-4">Фото немає</p>
          )}

          <label htmlFor={`${uid}-target`} className="label mt-3">
            Куди додати
          </label>
          <select
            id={`${uid}-target`}
            className="field"
            value={d.target}
            disabled={disabled}
            onChange={(e) => onChange({ target: e.target.value })}
          >
            <option value="new">Нова картина</option>
            {gallery.paintings.map((p, i) => (
              <option key={p.id} value={p.id}>
                Заповнити картину {i + 1}: {p.title || 'без назви'}
              </option>
            ))}
          </select>

          {d.target === 'new' && (
            <>
              <label htmlFor={`${uid}-photo`} className="label mt-3">
                {d.image ? 'Замінити фото' : 'Додати фото'}
              </label>
              <input
                id={`${uid}-photo`}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={disabled}
                onChange={(e) => onImage(e.target.files?.[0])}
                className="w-full text-sm"
              />
            </>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <div key={f.key}>
              <label htmlFor={`${uid}-${f.key}`} className="label">
                {f.label}
              </label>
              <input
                id={`${uid}-${f.key}`}
                className="field"
                value={d.facts[f.key]}
                maxLength={f.max}
                disabled={disabled}
                onChange={(e) => setFact(f.key, e.target.value)}
              />
            </div>
          ))}
          <div className="sm:col-span-2">
            <label htmlFor={`${uid}-context`} className="label">
              Контекст
            </label>
            <textarea
              id={`${uid}-context`}
              className="field"
              rows={4}
              maxLength={2000}
              value={d.facts.context}
              disabled={disabled}
              onChange={(e) => setFact('context', e.target.value)}
            />
          </div>
        </div>
      </div>

      {d.error && (
        <p role="alert" className="mt-3 font-semibold text-danger">
          {d.error}
        </p>
      )}
    </article>
  );
}
