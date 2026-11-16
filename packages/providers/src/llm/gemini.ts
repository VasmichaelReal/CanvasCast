import {
  buildSystemPrompt,
  buildUserPrompt,
  parseGeneratedDescription,
  type GeneratedDescription,
} from '@canvascast/core';
import { ProviderError, isRetryableStatus } from '../errors';
import type { DescribeInput, LLMProvider } from './types';

const API = 'https://generativelanguage.googleapis.com/v1beta/models';

interface GeminiResponse {
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: Array<{ text?: string; thought?: boolean }> };
  }>;
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
}

/**
 * Google Gemini (free tier в AI Studio). Викликаємо REST напряму — без SDK-залежності.
 * Якщо основна модель перевантажена (503) або вичерпала квоту (429), той самий
 * запит одразу йде до резервної: у кожної моделі своя квота.
 */
export class GeminiLLM implements LLMProvider {
  readonly name: string;
  private readonly models: string[];

  constructor(private readonly apiKey: string, model: string, fallbackModel?: string) {
    this.models = fallbackModel && fallbackModel !== model ? [model, fallbackModel] : [model];
    this.name = `gemini:${this.models.join('→')}`;
  }

  async describe(input: DescribeInput): Promise<GeneratedDescription> {
    let lastError: unknown;
    for (const model of this.models) {
      try {
        return await this.describeWith(model, input);
      } catch (err) {
        lastError = err;
        // Помилку запиту (поганий ключ, відмова фільтра) інша модель не виправить.
        if (err instanceof ProviderError && !err.retryable) throw err;
      }
    }
    throw lastError;
  }

  private async describeWith(model: string, input: DescribeInput): Promise<GeneratedDescription> {
    let res: Response;
    try {
      res = await fetch(`${API}/${model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': this.apiKey },
        signal: AbortSignal.timeout(120_000),
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: buildSystemPrompt(input.lang) }] },
          contents: [
            {
              role: 'user',
              parts: [
                { inlineData: { mimeType: 'image/jpeg', data: input.image.toString('base64') } },
                { text: buildUserPrompt(input.facts) },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.8,
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              properties: {
                description: { type: 'STRING' },
                suggestedTitle: { type: 'STRING' },
                uncertain: { type: 'ARRAY', items: { type: 'STRING' } },
              },
              required: ['description', 'suggestedTitle', 'uncertain'],
            },
          },
        }),
      });
    } catch (err) {
      throw new ProviderError(`Gemini (${model}): ${err instanceof Error ? err.message : String(err)}`);
    }

    const data = (await res.json().catch(() => ({}))) as GeminiResponse;
    if (!res.ok) {
      throw new ProviderError(
        `Gemini ${res.status} (${model}): ${firstLine(data.error?.message) ?? res.statusText}`,
        isRetryableStatus(res.status),
      );
    }
    if (data.promptFeedback?.blockReason) {
      throw new ProviderError(`Gemini відхилила запит: ${data.promptFeedback.blockReason}`, false);
    }
    const candidate = data.candidates?.[0];
    const text = (candidate?.content?.parts ?? [])
      .filter((p) => !p.thought && typeof p.text === 'string')
      .map((p) => p.text)
      .join('');
    if (!text) {
      throw new ProviderError(`Gemini не повернула тексту (finishReason: ${candidate?.finishReason ?? '?'})`);
    }
    return parseGeneratedDescription(text);
  }
}

/** Повідомлення про квоту в Gemini багаторядкові; власнику досить першого рядка. */
function firstLine(message: string | undefined): string | undefined {
  return message?.split('\n')[0]?.trim() || undefined;
}
