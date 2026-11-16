import { env } from '@canvascast/core';
import { ProviderError } from '../errors';
import { EdgeTts } from './edge';
import { GeminiTts } from './gemini';
import { MockTts } from './mock';
import type { TtsProvider } from './types';

export type { TtsProvider, TtsResult } from './types';
export { EdgeTts, GeminiTts, MockTts };
export { pcmToWav } from './wav';

/**
 * Вибір провайдера озвучення. Апгрейд на ElevenLabs/Azure — це ще одна
 * реалізація TtsProvider і гілка тут.
 */
export function createTtsProvider(): TtsProvider {
  const choice = env.ttsProvider;
  if (choice === 'edge') return new EdgeTts({ uk: env.ttsVoiceUk, en: env.ttsVoiceEn });
  if (choice === 'mock') return new MockTts();
  if (choice === 'gemini') {
    if (!env.geminiApiKey) throw new ProviderError('TTS_PROVIDER=gemini, але GEMINI_API_KEY не задано', false);
    return new GeminiTts(env.geminiApiKey, env.geminiTtsModel);
  }
  throw new ProviderError(`Невідомий TTS_PROVIDER: ${choice}`, false);
}
