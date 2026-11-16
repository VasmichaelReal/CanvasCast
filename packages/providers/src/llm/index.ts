import { env } from '@canvascast/core';
import { ProviderError } from '../errors';
import { GeminiLLM } from './gemini';
import { MockLLM } from './mock';
import type { LLMProvider } from './types';

export type { DescribeInput, LLMProvider } from './types';
export { GeminiLLM, MockLLM };
export { ProviderError } from '../errors';

/**
 * Вибір провайдера за конфігом. Щоб додати Claude чи Ollama — реалізуйте
 * LLMProvider і додайте гілку тут; решта системи не зміниться.
 */
export function createLLMProvider(): LLMProvider {
  const choice = env.llmProvider;
  const key = env.geminiApiKey;

  if (choice === 'mock') return new MockLLM();
  if (choice === 'gemini') {
    if (!key) throw new ProviderError('LLM_PROVIDER=gemini, але GEMINI_API_KEY не задано', false);
    return new GeminiLLM(key, env.geminiModel, env.geminiFallbackModel);
  }
  if (choice === 'auto') return key ? new GeminiLLM(key, env.geminiModel, env.geminiFallbackModel) : new MockLLM();

  throw new ProviderError(`Невідомий LLM_PROVIDER: ${choice}`, false);
}
