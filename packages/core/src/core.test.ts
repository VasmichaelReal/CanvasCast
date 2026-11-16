import { describe, expect, it } from 'vitest';
import {
  buildSystemPrompt,
  buildSpeechText,
  buildSpokenIntro,
  buildUserPrompt,
  checkFactsInText,
  createGallerySchema,
  generateToken,
  isPublicMediaKey,
  isWellFormedToken,
  parseGeneratedDescription,
  storageKeys,
  updatePaintingSchema,
} from './index';

const GID = '3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b';
const PID = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

describe('токени доступу', () => {
  it('довгі, URL-безпечні й не повторюються', () => {
    const tokens = new Set(Array.from({ length: 500 }, generateToken));
    expect(tokens.size).toBe(500);
    for (const t of tokens) expect(isWellFormedToken(t)).toBe(true);
  });

  it('відсікає сміття ще до звернення в БД', () => {
    for (const bad of ['', 'short', 'a'.repeat(31), 'a'.repeat(33), `${'a'.repeat(31)}/`, null, 42]) {
      expect(isWellFormedToken(bad)).toBe(false);
    }
  });
});

describe('ключі сховища', () => {
  it('згенеровані ключі проходять перевірку публічного медіа-роуту', () => {
    expect(isPublicMediaKey(storageKeys.image(GID, PID))).toBe(true);
    expect(isPublicMediaKey(storageKeys.thumb(GID, PID))).toBe(true);
    expect(isPublicMediaKey(storageKeys.audio(GID, PID, 'uk', 'mp3'))).toBe(true);
    expect(isPublicMediaKey(storageKeys.audio(GID, PID, 'en', 'wav'))).toBe(true);
  });

  it('не пускає довільні шляхи', () => {
    for (const bad of [
      '../etc/passwd',
      `g/${GID}/p/${PID}/../../secret.jpg`,
      `g/${GID}/p/${PID}/image-abc.exe`,
      `x/${GID}/p/${PID}/image-abc.jpg`,
      `g/${GID}/p/${PID}/image-abc.jpg/extra`,
    ]) {
      expect(isPublicMediaKey(bad)).toBe(false);
    }
  });

  it('усі файли картини лежать під її префіксом', () => {
    expect(storageKeys.image(GID, PID).startsWith(storageKeys.paintingPrefix(GID, PID))).toBe(true);
    expect(storageKeys.paintingPrefix(GID, PID).startsWith(storageKeys.galleryPrefix(GID))).toBe(true);
  });
});

describe('валідація', () => {
  it('галерею не створити без підтвердження прав на зображення', () => {
    expect(createGallerySchema.safeParse({ name: 'Галерея', rightsConfirmed: false }).success).toBe(false);
    expect(createGallerySchema.safeParse({ name: '   ', rightsConfirmed: true }).success).toBe(false);
    const ok = createGallerySchema.parse({ name: '  Галерея  ', rightsConfirmed: true });
    expect(ok).toMatchObject({ name: 'Галерея', lang: 'uk' });
  });

  it('порожні відомості про картину стають null, а не порожнім рядком', () => {
    const parsed = updatePaintingSchema.parse({ author: '  ', year: ' 1890 ' });
    expect(parsed).toEqual({ author: null, year: '1890' });
  });

  it('не чіпає поля, яких у запиті немає', () => {
    expect(updatePaintingSchema.parse({ move: 1 })).toEqual({ move: 1 });
  });
});

describe('промпт', () => {
  it('мова відповіді відповідає мові галереї', () => {
    expect(buildSystemPrompt('uk')).toContain('українською мовою');
    expect(buildSystemPrompt('en')).toContain('in English');
  });

  it('передає моделі лише заповнені відомості власника', () => {
    const prompt = buildUserPrompt({ author: 'Катерина Білокур', year: '', technique: null });
    expect(prompt).toContain('Автор: Катерина Білокур');
    expect(prompt).not.toContain('Рік');
    expect(prompt).not.toContain('Техніка');
  });

  it('прямо каже моделі, коли відомостей немає', () => {
    expect(buildUserPrompt({})).toContain('спирайся лише на зображення');
  });
});

describe('розбір відповіді моделі', () => {
  const description = 'На передньому плані, трохи ліворуч, стоїть жінка у плащі теплого кольору.';

  it('розбирає чистий JSON і JSON в обгортці ```', () => {
    const json = JSON.stringify({ description, suggestedTitle: 'Жінка', uncertain: ['Можливо, це осінь'] });
    for (const raw of [json, '```json\n' + json + '\n```']) {
      expect(parseGeneratedDescription(raw)).toEqual({
        description,
        suggestedTitle: 'Жінка',
        uncertain: ['Можливо, це осінь'],
      });
    }
  });

  it('терпить відсутні необов’язкові поля', () => {
    expect(parseGeneratedDescription(JSON.stringify({ description }))).toEqual({
      description,
      suggestedTitle: '',
      uncertain: [],
    });
  });

  it('відхиляє не-JSON і порожній опис — задача піде на повтор', () => {
    expect(() => parseGeneratedDescription('Вибачте, не можу описати')).toThrow();
    expect(() => parseGeneratedDescription(JSON.stringify({ description: 'коротко' }))).toThrow();
  });
});

describe('вступ диктора', () => {
  it('називає факти власника дослівно й пропускає порожні', () => {
    expect(buildSpokenIntro({ title: 'Соняшники', author: 'Вінсент ван Гог', year: '1888', technique: 'олія на полотні' }))
      .toBe('Соняшники. Вінсент ван Гог, 1888. олія на полотні.');
    expect(buildSpokenIntro({ title: 'Без автора.', year: ' 1900 ' })).toBe('Без автора. 1900.');
    expect(buildSpokenIntro({})).toBe('');
  });

  it('текст для озвучення = вступ + опис; без фактів — лише опис', () => {
    expect(buildSpeechText({ title: 'Ранок' }, ' Тихе світло. ')).toBe('Ранок.\n\nТихе світло.');
    expect(buildSpeechText({}, 'Тихе світло.')).toBe('Тихе світло.');
  });
});

describe('перевірка тексту на вигадані дати', () => {
  it('роки з відомостей власника (зокрема з контексту) — не зауваження', () => {
    expect(checkFactsInText({ year: '2024' }, 'Твір створено у 2024 році.')).toEqual([]);
    expect(checkFactsInText({ year: '1889–1890' }, 'Між 1889 і 1890 роками.')).toEqual([]);
    expect(checkFactsInText({ context: 'Написано після повені 1931 року' }, 'Після повені 1931 року.')).toEqual([]);
    expect(checkFactsInText({ year: '2024' }, 'Без жодних дат, лише 12 яблук і 150 птахів.')).toEqual([]);
  });

  it('рік, якого власник не давав, — просимо перевірити', () => {
    expect(checkFactsInText({ year: '2024' }, 'Твір створено у 2020 році.')).toEqual([
      'У тексті згадано рік 2020, якого немає у ваших відомостях про картину.',
    ]);
    expect(checkFactsInText({}, 'У 1870 та 1870 роках.')).toHaveLength(1);
  });
});
