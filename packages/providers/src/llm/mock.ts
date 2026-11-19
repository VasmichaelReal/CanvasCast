import { IMPORT_FIELD_LIMITS, MAX_IMPORTED_PAINTINGS, type GeneratedDescription, type ImportResult, type ImportedPainting } from '@canvascast/core';
import type { DescribeInput, ExtractInput, LLMProvider } from './types';

/**
 * Заглушка без AI: дає змогу пройти весь цикл (завантаження → опис → озвучення →
 * перегляд) без жодного API-ключа. Текст чесно каже, що він демонстраційний.
 */
export class MockLLM implements LLMProvider {
  readonly name = 'mock';

  async describe(input: DescribeInput): Promise<GeneratedDescription> {
    const { facts, lang } = input;
    if (lang === 'en') {
      const about = [facts.title && `“${facts.title}”`, facts.author && `by ${facts.author}`, facts.year]
        .filter(Boolean)
        .join(', ');
      return {
        description:
          `This is a demonstration description${about ? ` for the painting ${about}` : ''}. ` +
          'The image analysis model is not connected yet, so this text was not produced by looking at the painting. ' +
          'Once a Gemini API key is added to the settings, this place will hold a vivid audio description: ' +
          'the space of the canvas revealed step by step, from the foreground to the far distance, ' +
          'the poses and gestures of the figures, and colour conveyed through warmth, coolness and the softness of light.',
        suggestedTitle: facts.title ? '' : 'Untitled painting',
        uncertain: ['Demo text: no AI model is connected. Add GEMINI_API_KEY and regenerate.'],
      };
    }
    const about = [facts.title && `«${facts.title}»`, facts.author, facts.year].filter(Boolean).join(', ');
    return {
      description:
        `Це демонстраційний опис${about ? ` для картини ${about}` : ''}. ` +
        'Модель аналізу зображень ще не підключено, тому цей текст створено не на основі самої картини. ' +
        'Щойно в налаштуваннях з\'явиться ключ Gemini, тут буде жива аудіодескрипція: ' +
        'простір полотна, розкритий крок за кроком — від переднього плану до далекої глибини, ' +
        'пози та жести постатей, а колір — через тепло, прохолоду й м\'якість світла.',
      suggestedTitle: facts.title ? '' : 'Картина без назви',
      uncertain: ['Демо-текст: AI-модель не підключено. Додайте GEMINI_API_KEY і згенеруйте опис знову.'],
    };
  }

  /**
   * Без моделі документ не зрозуміти, тож розкладаємо його грубо: кожен абзац (блок,
   * відокремлений порожнім рядком чи зображенням) — окрема картка, перший рядок — назва.
   */
  async extractPaintings(input: ExtractInput): Promise<ImportResult> {
    const demoNote =
      input.lang === 'en'
        ? 'Demo mode: no AI model is connected, so the document was split into cards mechanically. Check every card.'
        : 'Демо-режим: AI-модель не підключено, тож документ розкладено на картки механічно. Перевірте кожну картку.';
    if (input.text === undefined) {
      const note =
        input.lang === 'en'
          ? 'Demo mode cannot read scanned PDFs. Add GEMINI_API_KEY or import a document with a text layer.'
          : 'У демо-режимі скани PDF не розпізнаються. Додайте GEMINI_API_KEY або імпортуйте документ із текстом.';
      return { paintings: [], notes: [note] };
    }

    const L = IMPORT_FIELD_LIMITS;
    const paintings: ImportedPainting[] = [];
    let pendingImage: number | null = null;
    for (const chunk of input.text.split(/(\[\[IMAGE \d+\]\])|\n\s*\n/)) {
      if (!chunk) continue;
      const marker = /^\[\[IMAGE (\d+)\]\]$/.exec(chunk);
      if (marker) {
        pendingImage = Number(marker[1]);
        continue;
      }
      const lines = chunk.split('\n').map((l) => l.trim()).filter((l) => /\p{L}/u.test(l));
      if (lines.length === 0) continue;
      paintings.push({
        title: lines[0]!.slice(0, L.title),
        author: '',
        year: '',
        technique: '',
        context: lines.slice(1).join('\n').slice(0, L.context),
        imageIndex: pendingImage,
      });
      pendingImage = null;
      if (paintings.length >= MAX_IMPORTED_PAINTINGS) break;
    }
    return { paintings, notes: [demoNote] };
  }
}
