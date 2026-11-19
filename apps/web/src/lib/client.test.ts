import { describe, expect, it } from 'vitest';
import {
  audioExtension,
  descriptionAsText,
  downloadFileName,
  mergeKnownGalleries,
  parseKnownGalleries,
  serializeKnownGalleries,
} from './client';

describe('downloadFileName', () => {
  it('зберігає кирилицю й прибирає заборонені символи', () => {
    expect(downloadFileName('Соняшники: «ранок» / вечір?', 'mp3')).toBe('Соняшники «ранок» вечір.mp3');
  });
  it('має запасне ім’я для порожньої назви', () => {
    expect(downloadFileName('  ...  ', 'txt')).toBe('canvascast.txt');
  });
  it('обрізає задовгі назви', () => {
    expect(downloadFileName('а'.repeat(300), 'txt')).toHaveLength(84);
  });
});

describe('audioExtension', () => {
  it('бере розширення з адреси', () => {
    expect(audioExtension('/api/media/g/x/p/y/audio-uk-abc.wav')).toBe('wav');
    expect(audioExtension('/api/media/без-розширення')).toBe('mp3');
  });
});

describe('descriptionAsText', () => {
  it('складає назву, відомості й абзаци', () => {
    expect(
      descriptionAsText({ title: 'Назва', author: 'Автор', year: '1901', technique: null, text: 'Раз.\n\n\nДва. ' }),
    ).toBe('Назва\nАвтор, 1901\n\nРаз.\n\nДва.\n');
  });
  it('без відомостей не лишає порожнього рядка після назви', () => {
    expect(descriptionAsText({ title: 'Назва', text: 'Текст' })).toBe('Назва\n\nТекст\n');
  });
});

describe('експорт та імпорт списку галерей', () => {
  const a = { name: 'Перша', editToken: 'A'.repeat(32), createdAt: 2 };
  const b = { name: 'Друга', editToken: 'b_-'.repeat(10) + 'bb', createdAt: 1 };

  it('читає власний файл експорту, зокрема з BOM', () => {
    expect(parseKnownGalleries('\uFEFF' + serializeKnownGalleries([a, b]))).toEqual([a, b]);
  });

  it('відкидає записи з некоректним токеном і дублікати', () => {
    const text = JSON.stringify([a, a, { name: 'x', editToken: 'short' }, null]);
    expect(parseKnownGalleries(text)).toEqual([a]);
  });

  it('знаходить посилання на редактор у звичайному тексті', () => {
    const text = `Моя галерея: https://canvascast.example/e/${a.editToken}\nще /e/${b.editToken}`;
    expect(parseKnownGalleries(text).map((g) => g.editToken)).toEqual([a.editToken, b.editToken]);
  });

  it('повідомляє, якщо галерей не знайдено', () => {
    expect(() => parseKnownGalleries('просто текст')).toThrow(/не знайдено/);
  });

  it('не перезаписує наявні галереї й рахує лише нові', () => {
    const renamed = { ...a, name: 'Стара назва' };
    const { list, added } = mergeKnownGalleries([a], [renamed, b]);
    expect(added).toBe(1);
    expect(list).toEqual([a, b]);
  });
});
