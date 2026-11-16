import { CreateGalleryForm } from '@/components/CreateGalleryForm';

export default function HomePage() {
  return (
    <main id="main" className="mx-auto max-w-2xl px-5 py-10">
      <p className="text-base font-semibold uppercase tracking-wide text-accent">CanvasCast</p>
      <h1 className="mt-1 text-4xl font-bold leading-tight">Аудіогід галереї для незрячих відвідувачів</h1>
      <p className="mt-4 text-lg text-muted">
        Завантажте фото картин — і отримаєте художні аудіоописи: композицію, пози й жести, колір
        через відчуття тепла й світла, атмосферу епохи. Відвідувач сканує QR-код і слухає на
        власному телефоні — без реєстрації, без встановлення застосунку, навіть без інтернету.
      </p>

      <section aria-labelledby="create-heading" className="card mt-8">
        <h2 id="create-heading" className="text-2xl font-bold">
          Створити галерею
        </h2>
        <CreateGalleryForm />
      </section>

      <section aria-labelledby="how-heading" className="mt-10">
        <h2 id="how-heading" className="text-2xl font-bold">
          Як це працює
        </h2>
        <ol className="mt-3 list-decimal space-y-2 pl-6">
          <li>Створіть галерею й завантажте фото картин. За бажанням додайте автора, рік, техніку.</li>
          <li>Натисніть «Згенерувати описи» — система напише й озвучить опис кожної картини.</li>
          <li>Перевірте тексти, за потреби відредагуйте.</li>
          <li>Роздрукуйте QR-код або надішліть посилання відвідувачам та екскурсоводам.</li>
        </ol>
      </section>
    </main>
  );
}
