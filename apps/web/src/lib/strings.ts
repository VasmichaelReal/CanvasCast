import type { Lang } from '@canvascast/core';

/** Тексти інтерфейсу відвідувача. Мова інтерфейсу збігається з мовою описів галереї. */
export interface Strings {
  audioGuide: string;
  paintings: string;
  empty: string;
  paintingN: (n: number) => string;
  minutes: (seconds: number) => string;
  position: (n: number, total: number) => string;
  navigation: string;
  otherPaintings: string;
  backToList: string;
  previous: string;
  next: string;
  description: string;
  imageAlt: (title: string) => string;
  player: string;
  play: string;
  pause: string;
  resume: string;
  seek: string;
  timeOf: (current: string, total: string) => string;
  back15: string;
  forward15: string;
  speed: string;
  normalSpeed: string;
  audioError: string;
  audioPending: string;
  readAloud: string;
  stopReading: string;
  offlineTitle: string;
  offlineNone: string;
  offlineSave: string;
  offlineDownloading: (done: number, total: number) => string;
  offlineReady: string;
  offlineStale: string;
  offlineUpdate: string;
  offlineFailed: string;
  offlineRetry: string;
}

const uk: Strings = {
  audioGuide: 'Аудіогід',
  paintings: 'Картини',
  empty: 'У цій галереї ще немає описів картин. Завітайте трохи пізніше.',
  paintingN: (n) => `Картина ${n}`,
  minutes: (s) => `${Math.max(1, Math.round(s / 60))} хв`,
  position: (n, total) => `Картина ${n} з ${total}`,
  navigation: 'Навігація',
  otherPaintings: 'Інші картини',
  backToList: 'До списку картин',
  previous: 'Попередня',
  next: 'Наступна',
  description: 'Текст опису',
  imageAlt: (title) => `Зображення картини «${title}». Її опис наведено вище.`,
  player: 'Аудіоопис',
  play: 'Слухати опис',
  pause: 'Пауза',
  resume: 'Продовжити',
  seek: 'Позиція відтворення',
  timeOf: (c, total) => `${c} з ${total}`,
  back15: '← 15 секунд назад',
  forward15: '15 секунд уперед →',
  speed: 'Швидкість відтворення',
  normalSpeed: 'Звичайна (1×)',
  audioError: 'Не вдалося відтворити аудіо. Текст опису наведено нижче.',
  audioPending: 'Аудіозапис для цієї картини ще готується. Текст опису наведено нижче.',
  readAloud: 'Прочитати вголос',
  stopReading: 'Зупинити читання',
  offlineTitle: 'Робота без інтернету',
  offlineNone: 'Збережіть гід на телефон, щоб слухати описи без інтернету.',
  offlineSave: 'Зберегти для роботи без інтернету',
  offlineDownloading: (done, total) => (total ? `Зберігаємо: ${done} з ${total}…` : 'Зберігаємо…'),
  offlineReady: 'Гід збережено. Він працюватиме без інтернету.',
  offlineStale: 'Галерею оновлено. Збережена копія застаріла.',
  offlineUpdate: 'Оновити збережену копію',
  offlineFailed: 'Не вдалося зберегти гід. Перевірте з’єднання й вільне місце на пристрої.',
  offlineRetry: 'Спробувати знову',
};

const en: Strings = {
  audioGuide: 'Audio guide',
  paintings: 'Paintings',
  empty: 'This gallery has no painting descriptions yet. Please come back later.',
  paintingN: (n) => `Painting ${n}`,
  minutes: (s) => `${Math.max(1, Math.round(s / 60))} min`,
  position: (n, total) => `Painting ${n} of ${total}`,
  navigation: 'Navigation',
  otherPaintings: 'Other paintings',
  backToList: 'Back to the list',
  previous: 'Previous',
  next: 'Next',
  description: 'Description text',
  imageAlt: (title) => `Image of the painting “${title}”. Its description is given above.`,
  player: 'Audio description',
  play: 'Listen to the description',
  pause: 'Pause',
  resume: 'Resume',
  seek: 'Playback position',
  timeOf: (c, total) => `${c} of ${total}`,
  back15: '← Back 15 seconds',
  forward15: 'Forward 15 seconds →',
  speed: 'Playback speed',
  normalSpeed: 'Normal (1×)',
  audioError: 'The audio could not be played. The description text is below.',
  audioPending: 'The audio for this painting is still being prepared. The description text is below.',
  readAloud: 'Read aloud',
  stopReading: 'Stop reading',
  offlineTitle: 'Use without internet',
  offlineNone: 'Save the guide to your phone to listen without an internet connection.',
  offlineSave: 'Save for offline use',
  offlineDownloading: (done, total) => (total ? `Saving: ${done} of ${total}…` : 'Saving…'),
  offlineReady: 'The guide is saved and will work without internet.',
  offlineStale: 'The gallery has been updated. Your saved copy is out of date.',
  offlineUpdate: 'Update the saved copy',
  offlineFailed: 'Could not save the guide. Check your connection and free space on the device.',
  offlineRetry: 'Try again',
};

export const STRINGS: Record<Lang, Strings> = { uk, en };
