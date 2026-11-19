import { CreateGalleryForm } from '@/components/CreateGalleryForm';
import { Masthead } from '@/components/Masthead';

const STEPS = [
  ['Фото', 'Створіть галерею й завантажте фото картин. Автора, рік і техніку можна додати одразу або пізніше.'],
  ['Описи', 'Система напише й озвучить опис кожної картини: композицію, жести, колір, атмосферу.'],
  ['Перевірка', 'Прочитайте тексти й виправте, де потрібно, — аудіо переозвучиться саме.'],
  ['QR-код', 'Роздрукуйте його біля входу або надішліть посилання. Відвідувач слухає на своєму телефоні.'],
] as const;

export default function HomePage() {
  return (
    <>
      <Masthead width="max-w-5xl" />
      <main id="main" className="mx-auto max-w-5xl px-5 pb-20">
        <div className="grid gap-12 pt-12 md:grid-cols-[1fr_24rem] md:gap-16 md:pt-20">
          <div>
            <h1 className="text-4xl leading-[1.1] sm:text-5xl">
              Аудіогід галереї для&nbsp;незрячих відвідувачів
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted">
              Завантажте фото картин — отримаєте художні аудіоописи. Відвідувач сканує QR-код і
              слухає на власному телефоні: без реєстрації, без застосунку, навіть без інтернету.
            </p>
          </div>

          <section aria-labelledby="create-heading" className="border-t border-ink pt-5 md:mt-2">
            <h2 id="create-heading" className="text-2xl">
              Нова галерея
            </h2>
            <CreateGalleryForm />
          </section>
        </div>

        <section aria-labelledby="how-heading" className="section mt-20">
          <h2 id="how-heading" className="text-2xl">
            Як це працює
          </h2>
          <ol className="mt-6 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(([title, text], i) => (
              <li key={title} className="border-t border-line pt-4">
                <p aria-hidden="true" className="font-serif text-3xl tabular-nums text-muted">
                  {String(i + 1).padStart(2, '0')}
                </p>
                <h3 className="mt-2 text-lg">{title}</h3>
                <p className="mt-1 text-muted">{text}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>
    </>
  );
}
