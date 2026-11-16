import { describe, expect, it } from 'vitest';
import { audioExtension, descriptionAsText, downloadFileName } from './client';

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
