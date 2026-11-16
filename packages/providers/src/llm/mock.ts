import type { GeneratedDescription } from '@canvascast/core';
import type { DescribeInput, LLMProvider } from './types';

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
}
