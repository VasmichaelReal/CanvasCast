/** Верхня смуга з назвою сервісу. Відвідувачам гіда посилання на головну не потрібне. */
export function Masthead({ note, home = true, width = 'max-w-3xl' }: { note?: string; home?: boolean; width?: string }) {
  const mark = (
    <>
      <span aria-hidden="true" className="inline-block size-3 bg-ink" />
      CanvasCast
    </>
  );
  return (
    <header className="border-b border-line">
      <div className={`mx-auto flex min-h-14 ${width} items-center justify-between gap-4 px-5`}>
        {home ? (
          <a href="/" className="inline-flex min-h-12 items-center gap-2 font-serif text-lg font-semibold text-ink no-underline">
            {mark}
          </a>
        ) : (
          <span className="inline-flex items-center gap-2 font-serif text-lg font-semibold">{mark}</span>
        )}
        {note && <span className="text-[0.95rem] text-muted">{note}</span>}
      </div>
    </header>
  );
}
