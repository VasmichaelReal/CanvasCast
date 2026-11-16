'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { EditorGallery, EditorPainting } from '@/lib/dto';
import {
  ApiError,
  api,
  audioExtension,
  descriptionAsText,
  downloadFileName,
  forgetGallery,
  jsonBody,
  prepareImageForUpload,
  rememberGallery,
  saveTextFile,
} from '@/lib/client';

const POLL_MS = 2500;
const MAX_FILES = 20;

const isWorking = (p: EditorPainting) =>
  p.description?.status === 'pending' || p.description?.status === 'generating';

const paintingName = (p: EditorPainting, index: number) => p.title || `Картина ${index + 1}`;

export function Editor({ editToken }: { editToken: string }) {
  const base = `/api/e/${editToken}`;
  const [gallery, setGallery] = useState<EditorGallery | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const previous = useRef<EditorGallery | null>(null);

  const announce = useCallback((message: string) => {
    // Порожній рядок між однаковими повідомленнями змушує скрінрідер прочитати їх знову.
    setAnnouncement('');
    requestAnimationFrame(() => setAnnouncement(message));
  }, []);

  /** Приймає свіжий стан галереї й озвучує завершення генерацій. */
  const applyGallery = useCallback(
    (next: EditorGallery) => {
      const before = previous.current;
      if (before) {
        next.paintings.forEach((p, i) => {
          const old = before.paintings.find((x) => x.id === p.id);
          if (!old || !isWorking(old)) return;
          if (p.description?.status === 'ready') announce(`Опис готовий: ${paintingName(p, i)}`);
          if (p.description?.status === 'failed') announce(`Не вдалося згенерувати: ${paintingName(p, i)}`);
        });
      }
      previous.current = next;
      setGallery(next);
    },
    [announce],
  );

  const refresh = useCallback(async () => {
    try {
      applyGallery(await api<EditorGallery>(`${base}/gallery`));
      setLoadError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setLoadError('Галерею не знайдено. Перевірте посилання для редагування.');
      } else if (!previous.current) {
        setLoadError('Не вдалося завантажити галерею. Перевірте з’єднання й оновіть сторінку.');
      }
    }
  }, [applyGallery, base]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Поки щось генерується — періодично питаємо сервер про статус.
  const working = gallery?.paintings.some(isWorking) ?? false;
  useEffect(() => {
    if (!working) return;
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [working, refresh]);

  useEffect(() => {
    if (gallery) rememberGallery({ name: gallery.name, editToken, createdAt: Date.now() });
  }, [gallery?.name, editToken]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loadError) {
    return (
      <main id="main" className="mx-auto max-w-2xl px-5 py-10">
        <h1 className="text-3xl font-bold">Редактор галереї</h1>
        <p role="alert" className="notice mt-6">
          {loadError}
        </p>
        <p className="mt-6">
          <a className="link" href="/">
            На головну
          </a>
        </p>
      </main>
    );
  }

  if (!gallery) {
    return (
      <main id="main" className="mx-auto max-w-2xl px-5 py-10">
        <p role="status">Завантажуємо галерею…</p>
      </main>
    );
  }

  return (
    <main id="main" className="mx-auto max-w-3xl px-5 py-8">
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>

      <p className="text-base font-semibold uppercase tracking-wide text-accent">
        CanvasCast · редактор
      </p>
      <h1 className="mt-1 text-3xl font-bold leading-tight">{gallery.name}</h1>

      {gallery.demoMode && (
        <p className="notice mt-5">
          <strong>Демо-режим.</strong> AI-модель ще не підключено, тому описи будуть
          демонстраційними. Додайте безкоштовний ключ <code>GEMINI_API_KEY</code> у файл{' '}
          <code>.env</code> і перезапустіть застосунок.
        </p>
      )}

      <ShareSection gallery={gallery} editToken={editToken} announce={announce} />
      <SettingsSection gallery={gallery} base={base} onGallery={applyGallery} announce={announce} />
      <UploadSection base={base} onGallery={applyGallery} announce={announce} />
      <PaintingsSection gallery={gallery} base={base} onGallery={applyGallery} announce={announce} />
      <DangerSection base={base} editToken={editToken} />
    </main>
  );
}

interface SectionProps {
  base: string;
  onGallery: (g: EditorGallery) => void;
  announce: (message: string) => void;
}

/* ───────────────────────── Посилання та QR ───────────────────────── */

function ShareSection({
  gallery,
  editToken,
  announce,
}: {
  gallery: EditorGallery;
  editToken: string;
  announce: (m: string) => void;
}) {
  const [editUrl, setEditUrl] = useState('');
  useEffect(() => setEditUrl(window.location.href), []);
  const readyCount = gallery.paintings.filter((p) => p.description?.text).length;

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      announce(`${what} скопійовано`);
    } catch {
      announce('Не вдалося скопіювати. Виділіть посилання вручну.');
    }
  }

  return (
    <section aria-labelledby="share-heading" className="card mt-6">
      <h2 id="share-heading" className="text-2xl font-bold">
        Посилання для відвідувачів
      </h2>
      {readyCount === 0 && (
        <p className="hint mt-1">
          Відвідувачі побачать картини, щойно для них буде згенеровано описи.
        </p>
      )}

      <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-start">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/e/${editToken}/qr`}
          alt="QR-код посилання на аудіогід галереї"
          width={176}
          height={176}
          className="size-44 shrink-0 rounded-lg border border-line bg-white"
        />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <label htmlFor="view-url" className="label">
              Посилання для перегляду
            </label>
            <input
              id="view-url"
              className="field"
              readOnly
              value={gallery.viewUrl}
              onFocus={(e) => e.target.select()}
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" className="btn" onClick={() => copy(gallery.viewUrl, 'Посилання для перегляду')}>
              Скопіювати посилання
            </button>
            <a className="btn" href={`/api/e/${editToken}/qr?download`} download="canvascast-qr.svg">
              Завантажити QR-код
            </a>
            <a className="btn" href={gallery.viewUrl} target="_blank" rel="noreferrer">
              Відкрити гід
            </a>
          </div>
        </div>
      </div>

      <div className="notice mt-5">
        <p>
          <strong>Збережіть посилання на цю сторінку.</strong> Це єдиний спосіб редагувати галерею:
          облікових записів немає, і втрачене посилання відновити неможливо. Нікому його не
          передавайте.
        </p>
        <button
          type="button"
          className="btn mt-3"
          onClick={() => copy(editUrl, 'Посилання для редагування')}
          disabled={!editUrl}
        >
          Скопіювати посилання для редагування
        </button>
      </div>
    </section>
  );
}

/* ───────────────────────── Назва та мова ───────────────────────── */

function SettingsSection({ gallery, base, onGallery, announce }: SectionProps & { gallery: EditorGallery }) {
  const [name, setName] = useState(gallery.name);
  const [lang, setLang] = useState(gallery.lang);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = name.trim() !== gallery.name || lang !== gallery.lang;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onGallery(await api<EditorGallery>(`${base}/gallery`, jsonBody('PATCH', { name, lang })));
      announce('Налаштування галереї збережено');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не вдалося зберегти');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="settings-heading" className="card mt-6">
      <h2 id="settings-heading" className="text-2xl font-bold">
        Налаштування
      </h2>
      <form onSubmit={save} className="mt-4 grid gap-4 sm:grid-cols-[1fr_12rem]">
        <div>
          <label htmlFor="settings-name" className="label">
            Назва галереї
          </label>
          <input
            id="settings-name"
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={120}
          />
        </div>
        <div>
          <label htmlFor="settings-lang" className="label">
            Мова описів
          </label>
          <select
            id="settings-lang"
            className="field"
            value={lang}
            onChange={(e) => setLang(e.target.value as 'uk' | 'en')}
            aria-describedby="settings-lang-hint"
          >
            <option value="uk">Українська</option>
            <option value="en">English</option>
          </select>
        </div>
        <p id="settings-lang-hint" className="hint sm:col-span-2">
          Після зміни мови описи потрібно згенерувати заново — уже цією мовою. Описи попередньою
          мовою зберігаються.
        </p>
        <div role="alert" className="font-semibold text-danger empty:hidden sm:col-span-2">
          {error}
        </div>
        <div className="sm:col-span-2">
          <button type="submit" className="btn" disabled={busy || !dirty}>
            {busy ? 'Зберігаємо…' : 'Зберегти налаштування'}
          </button>
        </div>
      </form>
    </section>
  );
}

/* ───────────────────────── Завантаження зображень ───────────────────────── */

function UploadSection({ base, onGallery, announce }: SectionProps) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [rejected, setRejected] = useState<Array<{ name: string; reason: string }>>([]);
  const [progress, setProgress] = useState('');

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    setRejected([]);
    if (list.length > MAX_FILES) {
      setMessage(`За один раз можна вибрати до ${MAX_FILES} зображень`);
      if (input.current) input.current.value = '';
      return;
    }
    setBusy(true);
    setMessage(null);
    type Rejected = typeof rejected;
    let added = 0;
    const failed: Rejected = [];
    // По одному файлу на запит: так не впираємося в ліміт розміру запиту на хостингу,
    // а одне невдале фото не зриває решту.
    for (const [i, file] of list.entries()) {
      setProgress(`Завантажуємо ${i + 1} з ${list.length}…`);
      try {
        const form = new FormData();
        form.append('files', await prepareImageForUpload(file), file.name);
        const res = await api<{ added: number; rejected: Rejected; gallery: EditorGallery }>(
          `${base}/paintings`,
          { method: 'POST', body: form },
        );
        added += res.added;
        failed.push(...res.rejected);
        onGallery(res.gallery);
      } catch (err) {
        const data = err instanceof ApiError ? (err.data as { rejected?: Rejected } | null) : null;
        if (data?.rejected?.length) failed.push(...data.rejected);
        else {
          const tooBig = err instanceof ApiError && err.status === 413;
          failed.push({
            name: file.name,
            reason: tooBig
              ? 'Файл завеликий для завантаження'
              : err instanceof Error
                ? err.message
                : 'Не вдалося завантажити файл',
          });
        }
      }
    }
    setRejected(failed);
    const text = added > 0 ? `Додано картин: ${added}` : 'Жоден файл не вдалося додати';
    setMessage(text);
    announce(added > 0 ? text : 'Помилка завантаження');
    setBusy(false);
    setProgress('');
    if (input.current) input.current.value = '';
  }

  return (
    <section aria-labelledby="upload-heading" className="card mt-6">
      <h2 id="upload-heading" className="text-2xl font-bold">
        Додати картини
      </h2>
      <label htmlFor="upload-input" className="label mt-4">
        Фото картин (можна кілька одразу)
      </label>
      <input
        ref={input}
        id="upload-input"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        disabled={busy}
        aria-describedby="upload-hint"
        onChange={(e) => void upload(e.target.files)}
        className="field file:mr-4 file:cursor-pointer file:rounded-md file:border-0 file:bg-accent file:px-4 file:py-2 file:font-semibold file:text-accent-ink"
      />
      <p id="upload-hint" className="hint mt-2">
        JPEG, PNG або WebP, до 20 файлів за раз. Великі фото автоматично зменшуються перед
        відправкою. Знімайте картину рівно, без
        відблисків — від якості фото залежить якість опису.
      </p>
      <div role="status" className="mt-3 font-semibold empty:hidden">
        {busy ? progress || 'Завантажуємо…' : message}
      </div>
      {rejected.length > 0 && (
        <ul className="mt-2 list-disc pl-6 text-danger">
          {rejected.map((r, i) => (
            <li key={i}>
              {r.name}: {r.reason}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ───────────────────────── Список картин ───────────────────────── */

function PaintingsSection({ gallery, base, onGallery, announce }: SectionProps & { gallery: EditorGallery }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { paintings } = gallery;
  const missing = paintings.filter((p) => p.description?.status !== 'ready' && !isWorking(p)).length;

  async function generateAll() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ started: number; warning: string | null; gallery: EditorGallery }>(
        `${base}/generate-all`,
        { method: 'POST' },
      );
      onGallery(res.gallery);
      if (res.warning) setError(res.warning);
      announce(`Запущено генерацію описів: ${res.started}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не вдалося запустити генерацію');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="paintings-heading" className="mt-8">
      <h2 id="paintings-heading" className="text-2xl font-bold">
        Картини ({paintings.length})
      </h2>

      {paintings.length === 0 ? (
        <p className="hint mt-2">Поки що порожньо. Додайте фото картин вище.</p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <button
              type="button"
              className="btn btn-primary"
              onClick={generateAll}
              disabled={busy || missing === 0}
            >
              {missing === 0 ? 'Усі описи згенеровано' : `Згенерувати описи (${missing})`}
            </button>
            <p className="hint">
              Спершу за бажанням заповніть відомості про картини — модель спирається на них як на
              факти.
            </p>
          </div>
          <div role="alert" className="mt-2 font-semibold text-danger empty:hidden">
            {error}
          </div>
          <ol className="mt-5 space-y-6">
            {paintings.map((p, i) => (
              <li key={p.id}>
                <PaintingCard
                  painting={p}
                  index={i}
                  total={paintings.length}
                  lang={gallery.lang}
                  base={base}
                  onGallery={onGallery}
                  announce={announce}
                />
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

const FACT_FIELDS = [
  { key: 'title', label: 'Назва', max: 200 },
  { key: 'author', label: 'Автор', max: 200 },
  { key: 'year', label: 'Рік', max: 60 },
  { key: 'technique', label: 'Техніка', max: 200 },
] as const;

type Facts = Record<'title' | 'author' | 'year' | 'technique' | 'context', string>;

const factsOf = (p: EditorPainting): Facts => ({
  title: p.title ?? '',
  author: p.author ?? '',
  year: p.year ?? '',
  technique: p.technique ?? '',
  context: p.context ?? '',
});

function PaintingCard({
  painting,
  index,
  total,
  lang,
  base,
  onGallery,
  announce,
}: SectionProps & { painting: EditorPainting; index: number; total: number; lang: 'uk' | 'en' }) {
  const d = painting.description;
  const name = paintingName(painting, index);
  const uid = painting.id;

  const [facts, setFacts] = useState<Facts>(() => factsOf(painting));
  const [factsDirty, setFactsDirty] = useState(false);
  const [text, setText] = useState(d?.text ?? '');
  const [textDirty, setTextDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Сервер може оновити дані (модель запропонувала назву, згенерувала текст).
  // Підхоплюємо їх, якщо власник у цю мить сам нічого не редагує.
  const serverFacts = JSON.stringify(factsOf(painting));
  useEffect(() => {
    if (!factsDirty) setFacts(JSON.parse(serverFacts) as Facts);
  }, [serverFacts]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!textDirty) setText(d?.text ?? '');
  }, [d?.text]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Сталася помилка');
    } finally {
      setBusy(null);
    }
  }

  const saveFacts = async () => {
    onGallery(await api<EditorGallery>(`${base}/paintings/${uid}`, jsonBody('PATCH', facts)));
    setFactsDirty(false);
  };

  const onSaveFacts = (e: React.FormEvent) => {
    e.preventDefault();
    void run('facts', async () => {
      await saveFacts();
      announce(`Відомості збережено: ${name}`);
    });
  };

  const onGenerate = () => {
    if (d?.text && !window.confirm(`Згенерувати опис заново? Поточний текст для «${name}» буде замінено.`)) {
      return;
    }
    void run('generate', async () => {
      if (factsDirty) await saveFacts();
      setTextDirty(false);
      onGallery(await api<EditorGallery>(`${base}/paintings/${uid}/generate`, { method: 'POST' }));
      announce(`Генеруємо опис: ${name}`);
    });
  };

  const onSaveText = () =>
    void run('text', async () => {
      if (!d) return;
      onGallery(await api<EditorGallery>(`${base}/descriptions/${d.id}`, jsonBody('PATCH', { text })));
      setTextDirty(false);
      announce(`Текст збережено, переозвучуємо: ${name}`);
    });

  const onMove = (move: -1 | 1) =>
    void run('move', async () => {
      onGallery(await api<EditorGallery>(`${base}/paintings/${uid}`, jsonBody('PATCH', { move })));
      announce(`${name}: переміщено ${move < 0 ? 'вище' : 'нижче'}`);
    });

  const onDelete = () => {
    if (!window.confirm(`Видалити картину «${name}» разом з описом і аудіо? Цю дію не можна скасувати.`)) {
      return;
    }
    void run('delete', async () => {
      onGallery(await api<EditorGallery>(`${base}/paintings/${uid}`, { method: 'DELETE' }));
      announce(`Картину видалено: ${name}`);
    });
  };

  const working = isWorking(painting);
  const statusText = !d
    ? 'Опис ще не згенеровано'
    : working
      ? d.text
        ? 'Озвучуємо текст…'
        : 'Генеруємо опис… Це може тривати до хвилини.'
      : d.status === 'failed'
        ? `Не вдалося згенерувати: ${d.error ?? 'невідома помилка'}`
        : 'Готово: текст і аудіо';

  return (
    <article aria-labelledby={`p-${uid}-title`} className="card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 id={`p-${uid}-title`} className="text-xl font-bold">
          {index + 1}. {name}
        </h3>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn"
            onClick={() => onMove(-1)}
            disabled={index === 0 || busy !== null}
            aria-label={`Перемістити вище: ${name}`}
          >
            ↑
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => onMove(1)}
            disabled={index === total - 1 || busy !== null}
            aria-label={`Перемістити нижче: ${name}`}
          >
            ↓
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={onDelete}
            disabled={busy !== null}
            aria-label={`Видалити: ${name}`}
          >
            Видалити
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-5 md:grid-cols-[14rem_1fr]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={painting.thumbUrl}
          alt={`Фото картини: ${name}`}
          loading="lazy"
          className="max-h-72 w-full rounded-lg border border-line object-contain md:w-56"
        />

        <form onSubmit={onSaveFacts} aria-label={`Відомості про картину: ${name}`}>
          <div className="grid gap-3 sm:grid-cols-2">
            {FACT_FIELDS.map((f) => (
              <div key={f.key}>
                <label htmlFor={`p-${uid}-${f.key}`} className="label">
                  {f.label}
                </label>
                <input
                  id={`p-${uid}-${f.key}`}
                  className="field"
                  value={facts[f.key]}
                  maxLength={f.max}
                  onChange={(e) => {
                    setFacts({ ...facts, [f.key]: e.target.value });
                    setFactsDirty(true);
                  }}
                />
              </div>
            ))}
            <div className="sm:col-span-2">
              <label htmlFor={`p-${uid}-context`} className="label">
                Контекст
              </label>
              <textarea
                id={`p-${uid}-context`}
                className="field"
                rows={2}
                maxLength={2000}
                value={facts.context}
                aria-describedby={`p-${uid}-context-hint`}
                onChange={(e) => {
                  setFacts({ ...facts, context: e.target.value });
                  setFactsDirty(true);
                }}
              />
              <p id={`p-${uid}-context-hint`} className="hint mt-1">
                Усе необов’язкове. Назву, автора, рік і техніку диктор оголосить перед описом
                дослівно. Контекст — історію створення, сюжет, хто зображений — модель використає
                як факти.
              </p>
            </div>
          </div>
          <button type="submit" className="btn mt-3" disabled={!factsDirty || busy !== null}>
            {busy === 'facts' ? 'Зберігаємо…' : 'Зберегти відомості'}
          </button>
        </form>
      </div>

      <div className="mt-5 border-t border-line pt-4">
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            className={d?.text ? 'btn' : 'btn btn-primary'}
            onClick={onGenerate}
            disabled={working || busy !== null}
          >
            {d?.text ? 'Згенерувати заново' : 'Згенерувати опис'}
          </button>
          <p
            role="status"
            className={`font-semibold ${d?.status === 'failed' ? 'text-danger' : d?.status === 'ready' ? 'text-ok' : ''}`}
          >
            {statusText}
          </p>
        </div>

        <div role="alert" className="mt-2 font-semibold text-danger empty:hidden">
          {error}
        </div>

        {d && d.uncertain.length > 0 && (
          <div className="notice mt-4">
            <p className="font-semibold">Модель не впевнена — перевірте, будь ласка:</p>
            <ul className="mt-1 list-disc pl-6">
              {d.uncertain.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
          </div>
        )}

        {d?.text && (
          <div className="mt-4">
            <label htmlFor={`p-${uid}-text`} className="label">
              Текст опису{d.textEdited ? ' (відредаговано вручну)' : ''}
            </label>
            <textarea
              id={`p-${uid}-text`}
              className="field leading-relaxed"
              rows={10}
              lang={lang}
              maxLength={8000}
              value={text}
              aria-describedby={`p-${uid}-text-hint`}
              onChange={(e) => {
                setText(e.target.value);
                setTextDirty(true);
              }}
            />
            <p id={`p-${uid}-text-hint`} className="hint mt-1">
              Опис створив ШІ, і він може помилятися. Ви відповідаєте за опублікований текст. Після
              збереження аудіо переозвучиться автоматично.
            </p>
            <button
              type="button"
              className="btn mt-3"
              onClick={onSaveText}
              disabled={!textDirty || !text.trim() || busy !== null}
            >
              {busy === 'text' ? 'Зберігаємо…' : 'Зберегти текст і переозвучити'}
            </button>

            {d.audioUrl && (
              <div className="mt-4">
                <p id={`p-${uid}-audio-label`} className="label">
                  Аудіо
                </p>
                <audio
                  controls
                  preload="none"
                  src={d.audioUrl}
                  aria-labelledby={`p-${uid}-audio-label p-${uid}-title`}
                  className="w-full"
                />
              </div>
            )}

            {d.text.trim() && (
              <div className="mt-4 flex flex-wrap gap-3">
                {d.audioUrl && (
                  <a
                    className="btn"
                    href={d.audioUrl}
                    download={downloadFileName(name, audioExtension(d.audioUrl))}
                  >
                    Завантажити аудіо
                  </a>
                )}
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    saveTextFile(
                      downloadFileName(name, 'txt'),
                      descriptionAsText({ ...painting, title: name, text: d.text }),
                    )
                  }
                >
                  Завантажити текст
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

/* ───────────────────────── Видалення галереї ───────────────────────── */

function DangerSection({ base, editToken }: { base: string; editToken: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!window.confirm('Видалити всю галерею з усіма картинами, описами й аудіо? Цю дію не можна скасувати.')) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api<void>(`${base}/gallery`, { method: 'DELETE' });
      forgetGallery(editToken);
      window.location.href = '/';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не вдалося видалити галерею');
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="danger-heading" className="mt-10 border-t border-line pt-6">
      <h2 id="danger-heading" className="text-xl font-bold">
        Видалення галереї
      </h2>
      <p className="hint mt-1">
        Усі зображення, описи й аудіо буде видалено назавжди, а QR-код перестане працювати.
      </p>
      <div role="alert" className="mt-2 font-semibold text-danger empty:hidden">
        {error}
      </div>
      <button type="button" className="btn btn-danger mt-3" onClick={remove} disabled={busy}>
        {busy ? 'Видаляємо…' : 'Видалити галерею'}
      </button>
    </section>
  );
}
