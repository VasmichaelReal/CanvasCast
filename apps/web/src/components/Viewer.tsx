'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Lang, PublicGallery, PublicPainting } from '@canvascast/core';
import { formatTime } from '@/lib/client';
import { STRINGS, type Strings } from '@/lib/strings';
import {
  downloadGallery,
  offlineSupported,
  readSavedVersion,
  registerServiceWorker,
} from '@/lib/offline';

type LoadState = 'loading' | 'ready' | 'notfound' | 'error';

/** Вибрана картина живе в адресі (#p=<id>), тож кнопка «Назад» повертає до списку. */
function selectedIdFromHash(): string | null {
  const match = /^#p=(.+)$/.exec(window.location.hash);
  return match ? decodeURIComponent(match[1]!) : null;
}

export function Viewer({ viewToken }: { viewToken: string }) {
  const [gallery, setGallery] = useState<PublicGallery | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/v/${viewToken}/gallery`);
      if (res.status === 404) return setState('notfound');
      if (!res.ok) throw new Error(String(res.status));
      setGallery((await res.json()) as PublicGallery);
      setState('ready');
    } catch {
      // Немає мережі й немає збереженої копії. Якщо галерея вже на екрані — лишаємо її.
      setState((s) => (s === 'ready' ? s : 'error'));
    }
  }, [viewToken]);

  useEffect(() => {
    registerServiceWorker();
    void load();
    const onOnline = () => void load();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [load]);

  useEffect(() => {
    const sync = () => setSelectedId(selectedIdFromHash());
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  const lang: Lang = gallery?.lang ?? 'uk';
  const t = STRINGS[lang];
  const index = gallery ? gallery.paintings.findIndex((p) => p.id === selectedId) : -1;
  const painting = index >= 0 ? gallery!.paintings[index]! : null;

  // Після переходу між списком і картиною переносимо фокус на заголовок,
  // щоб скрінрідер одразу оголосив, де опинився слухач.
  useEffect(() => {
    if (state !== 'ready') return;
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    heading.current?.focus();
    window.scrollTo(0, 0);
  }, [painting?.id, state]);

  useEffect(() => {
    if (!gallery) return;
    document.title = painting
      ? `${painting.title ?? t.paintingN(index + 1)} — ${gallery.name}`
      : `${gallery.name} — CanvasCast`;
  }, [gallery, painting, index, t]);

  if (state === 'loading') {
    return (
      <main id="main" className="mx-auto max-w-2xl px-5 py-10">
        <p role="status">Завантаження… / Loading…</p>
      </main>
    );
  }
  if (state === 'notfound' || state === 'error' || !gallery) {
    return (
      <main id="main" className="mx-auto max-w-2xl px-5 py-10">
        <h1 className="text-3xl font-bold">CanvasCast</h1>
        <div role="alert" className="notice mt-6 space-y-2">
          {state === 'notfound' ? (
            <>
              <p>Галерею не знайдено. Перевірте посилання або відскануйте QR-код ще раз.</p>
              <p lang="en">Gallery not found. Check the link or scan the QR code again.</p>
            </>
          ) : (
            <>
              <p>Не вдалося завантажити галерею. Перевірте з’єднання з інтернетом.</p>
              <p lang="en">Could not load the gallery. Check your internet connection.</p>
            </>
          )}
        </div>
        {state === 'error' && (
          <button type="button" className="btn mt-6" onClick={() => void load()}>
            Спробувати знову / Try again
          </button>
        )}
      </main>
    );
  }

  const paintings = gallery.paintings;

  return (
    <main id="main" lang={lang} className="mx-auto max-w-2xl px-5 py-8">
      {painting ? (
        <PaintingView
          key={painting.id}
          painting={painting}
          index={index}
          total={paintings.length}
          prev={paintings[index - 1] ?? null}
          next={paintings[index + 1] ?? null}
          galleryName={gallery.name}
          lang={lang}
          t={t}
          headingRef={heading}
        />
      ) : (
        <>
          <p className="text-base font-semibold uppercase tracking-wide text-accent">{t.audioGuide}</p>
          <h1 ref={heading} tabIndex={-1} className="mt-1 text-3xl font-bold leading-tight outline-none">
            {gallery.name}
          </h1>

          {paintings.length === 0 ? (
            <p className="notice mt-6">{t.empty}</p>
          ) : (
            <>
              <OfflinePanel gallery={gallery} viewToken={viewToken} t={t} />
              <h2 id="list-heading" className="mt-8 text-2xl font-bold">
                {t.paintings} ({paintings.length})
              </h2>
              <ol aria-labelledby="list-heading" className="mt-3 space-y-3">
                {paintings.map((p, i) => (
                  <li key={p.id}>
                    <a
                      href={`#p=${encodeURIComponent(p.id)}`}
                      className="card flex min-h-20 items-center gap-4 text-ink no-underline hover:bg-accent-soft"
                    >
                      {/* Мініатюра декоративна: назва й автор уже є в тексті посилання. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.thumbUrl}
                        alt=""
                        loading="lazy"
                        className="size-16 shrink-0 rounded-md border border-line object-cover"
                      />
                      <span className="min-w-0">
                        <span className="block text-lg font-bold">
                          {i + 1}. {p.title ?? t.paintingN(i + 1)}
                        </span>
                        {(p.author || p.audioDuration) && (
                          <span className="block text-muted">
                            {[p.author, p.audioDuration ? t.minutes(p.audioDuration) : null]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        )}
                      </span>
                    </a>
                  </li>
                ))}
              </ol>
            </>
          )}
        </>
      )}
    </main>
  );
}

/* ───────────────────────── Картина й плеєр ───────────────────────── */

function PaintingView({
  painting,
  index,
  total,
  prev,
  next,
  galleryName,
  lang,
  t,
  headingRef,
}: {
  painting: PublicPainting;
  index: number;
  total: number;
  prev: PublicPainting | null;
  next: PublicPainting | null;
  galleryName: string;
  lang: Lang;
  t: Strings;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const title = painting.title ?? t.paintingN(index + 1);
  const meta = [painting.author, painting.year, painting.technique].filter(Boolean).join(', ');

  return (
    <article aria-labelledby="painting-title">
      <nav aria-label={t.navigation}>
        <a href="#" className="link inline-flex min-h-12 items-center">
          ← {t.backToList}: {galleryName}
        </a>
      </nav>

      <p className="mt-3 text-muted">{t.position(index + 1, total)}</p>
      <h1
        id="painting-title"
        ref={headingRef}
        tabIndex={-1}
        className="text-3xl font-bold leading-tight outline-none"
      >
        {title}
      </h1>
      {meta && <p className="mt-1 text-lg text-muted">{meta}</p>}

      {painting.audioUrl ? (
        <AudioPlayer
          src={painting.audioUrl}
          knownDuration={painting.audioDuration}
          title={title}
          artist={painting.author ?? galleryName}
          artwork={painting.thumbUrl}
          t={t}
        />
      ) : (
        <SpeechFallback text={painting.text} lang={lang} t={t} />
      )}

      <section aria-labelledby="text-heading" className="mt-8">
        <h2 id="text-heading" className="text-2xl font-bold">
          {t.description}
        </h2>
        <div className="mt-3 space-y-4 text-lg leading-relaxed">
          {painting.text
            .split(/\n+/)
            .filter((para) => para.trim())
            .map((para, i) => (
              <p key={i}>{para}</p>
            ))}
        </div>
      </section>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={painting.thumbUrl}
        alt={t.imageAlt(title)}
        className="mt-8 max-h-[70vh] w-full rounded-lg border border-line object-contain"
      />

      <nav aria-label={t.otherPaintings} className="mt-8 grid grid-cols-2 gap-3">
        {prev ? (
          <a className="btn" href={`#p=${encodeURIComponent(prev.id)}`}>
            ← {t.previous}
          </a>
        ) : (
          <span />
        )}
        {next ? (
          <a className="btn btn-primary" href={`#p=${encodeURIComponent(next.id)}`}>
            {t.next} →
          </a>
        ) : (
          <a className="btn" href="#">
            {t.backToList}
          </a>
        )}
      </nav>
    </article>
  );
}

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];
const SPEED_KEY = 'cc-speed';

function AudioPlayer({
  src,
  knownDuration,
  title,
  artist,
  artwork,
  t,
}: {
  src: string;
  knownDuration: number | null;
  title: string;
  artist: string;
  artwork: string;
  t: Strings;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(knownDuration ?? 0);
  const [speed, setSpeed] = useState(1);
  const [failed, setFailed] = useState(false);

  // Швидкість запам'ятовуємо між картинами й візитами.
  useEffect(() => {
    const saved = Number(localStorage.getItem(SPEED_KEY));
    if (SPEEDS.includes(saved)) setSpeed(saved);
  }, []);
  useEffect(() => {
    if (audio.current) audio.current.playbackRate = speed;
  }, [speed]);

  // Керування з екрана блокування та гарнітури.
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist,
      artwork: [{ src: artwork, type: 'image/jpeg' }],
    });
    const el = () => audio.current;
    const handlers: Array<[MediaSessionAction, () => void]> = [
      ['play', () => void el()?.play()],
      ['pause', () => el()?.pause()],
      ['seekbackward', () => seekBy(-15)],
      ['seekforward', () => seekBy(15)],
    ];
    for (const [action, handler] of handlers) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        /* дія не підтримується браузером */
      }
    }
    return () => {
      for (const [action] of handlers) {
        try {
          navigator.mediaSession.setActionHandler(action, null);
        } catch {
          /* ignore */
        }
      }
    };
  }, [title, artist, artwork]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggle() {
    const el = audio.current;
    if (!el) return;
    if (el.paused) {
      setFailed(false);
      el.play().catch(() => setFailed(true));
    } else {
      el.pause();
    }
  }

  function seekTo(seconds: number) {
    const el = audio.current;
    if (!el) return;
    const max = Number.isFinite(el.duration) ? el.duration : duration;
    el.currentTime = Math.min(Math.max(0, seconds), max || 0);
    setCurrent(el.currentTime);
  }

  function seekBy(delta: number) {
    if (audio.current) seekTo(audio.current.currentTime + delta);
  }

  function changeSpeed(value: number) {
    setSpeed(value);
    try {
      localStorage.setItem(SPEED_KEY, String(value));
    } catch {
      /* ignore */
    }
  }

  return (
    <section aria-label={t.player} className="card mt-6">
      <audio
        ref={audio}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          e.currentTarget.playbackRate = speed;
          if (Number.isFinite(e.currentTarget.duration)) setDuration(e.currentTarget.duration);
        }}
        onDurationChange={(e) => {
          if (Number.isFinite(e.currentTarget.duration)) setDuration(e.currentTarget.duration);
        }}
        onError={() => setFailed(true)}
      />

      <button
        type="button"
        className="btn btn-primary min-h-16 w-full text-xl"
        onClick={toggle}
      >
        <span aria-hidden="true">{playing ? '❚❚' : '▶'}</span>
        {playing ? t.pause : current > 0 ? t.resume : t.play}
      </button>

      <div role="alert" className="mt-2 font-semibold text-danger empty:hidden">
        {failed ? t.audioError : null}
      </div>

      <div className="mt-4">
        <label htmlFor="seek" className="sr-only">
          {t.seek}
        </label>
        <input
          id="seek"
          type="range"
          min={0}
          max={Math.max(1, Math.floor(duration))}
          step={1}
          value={Math.min(Math.floor(current), Math.max(1, Math.floor(duration)))}
          onChange={(e) => seekTo(Number(e.target.value))}
          aria-valuetext={t.timeOf(formatTime(current), formatTime(duration))}
          className="h-12 w-full cursor-pointer accent-(--accent)"
        />
        <p aria-hidden="true" className="flex justify-between tabular-nums text-muted">
          <span>{formatTime(current)}</span>
          <span>{formatTime(duration)}</span>
        </p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <button type="button" className="btn" onClick={() => seekBy(-15)}>
          {t.back15}
        </button>
        <button type="button" className="btn" onClick={() => seekBy(15)}>
          {t.forward15}
        </button>
      </div>

      <div className="mt-4">
        <label htmlFor="speed" className="label">
          {t.speed}
        </label>
        <select
          id="speed"
          className="field"
          value={speed}
          onChange={(e) => changeSpeed(Number(e.target.value))}
        >
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s === 1 ? t.normalSpeed : `${s}×`}
            </option>
          ))}
        </select>
      </div>
    </section>
  );
}

/** Якщо аудіофайлу ще немає — читаємо текст голосом самого пристрою. */
function SpeechFallback({ text, lang, t }: { text: string; lang: Lang; t: Strings }) {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    setSupported('speechSynthesis' in window);
    return () => {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    };
  }, []);

  function toggle() {
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang === 'uk' ? 'uk-UA' : 'en-GB';
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  }

  return (
    <section aria-label={t.player} className="card mt-6">
      <p className="hint">{t.audioPending}</p>
      {supported && (
        <button type="button" className="btn btn-primary mt-3 min-h-16 w-full text-xl" onClick={toggle}>
          {speaking ? t.stopReading : t.readAloud}
        </button>
      )}
    </section>
  );
}

/* ───────────────────────── Офлайн-копія ───────────────────────── */

type OfflineState = 'none' | 'downloading' | 'ready' | 'stale' | 'failed';

function OfflinePanel({ gallery, viewToken, t }: { gallery: PublicGallery; viewToken: string; t: Strings }) {
  const [supported, setSupported] = useState(false);
  const [state, setState] = useState<OfflineState>('none');
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  useEffect(() => {
    setSupported(offlineSupported());
  }, []);

  // Порівнюємо збережену версію з поточною: якщо галерею змінили — пропонуємо оновити копію.
  useEffect(() => {
    setState((current) => {
      if (current === 'downloading') return current;
      const saved = readSavedVersion(viewToken);
      if (saved === null) return current === 'failed' ? current : 'none';
      return saved >= gallery.version ? 'ready' : 'stale';
    });
  }, [gallery.version, viewToken]);

  if (!supported) return null;

  async function save() {
    setState('downloading');
    setProgress({ done: 0, total: 0 });
    try {
      await downloadGallery(viewToken, gallery, (done, total) => setProgress({ done, total }));
      setState('ready');
    } catch {
      setState('failed');
    }
  }

  const message: Record<OfflineState, string> = {
    none: t.offlineNone,
    downloading: t.offlineDownloading(progress.done, progress.total),
    ready: t.offlineReady,
    stale: t.offlineStale,
    failed: t.offlineFailed,
  };
  const button: Record<OfflineState, string | null> = {
    none: t.offlineSave,
    downloading: null,
    ready: null,
    stale: t.offlineUpdate,
    failed: t.offlineRetry,
  };

  return (
    <section aria-labelledby="offline-heading" className="card mt-6">
      <h2 id="offline-heading" className="text-xl font-bold">
        {t.offlineTitle}
      </h2>
      <p role="status" className={`mt-1 ${state === 'ready' ? 'font-semibold text-ok' : ''}`}>
        {message[state]}
      </p>
      {state === 'downloading' && (
        <progress
          className="mt-3 h-3 w-full accent-(--accent)"
          max={Math.max(1, progress.total)}
          value={progress.done}
          aria-label={t.offlineTitle}
        />
      )}
      {button[state] && (
        <button type="button" className="btn mt-3 w-full" onClick={() => void save()}>
          {button[state]}
        </button>
      )}
    </section>
  );
}
