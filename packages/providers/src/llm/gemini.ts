import {
  buildImportSystemPrompt,
  buildImportUserPrompt,
  buildSystemPrompt,
  buildUserPrompt,
  parseGeneratedDescription,
  parseImportResult,
  type GeneratedDescription,
  type ImportResult,
} from '@canvascast/core';
import { ProviderError, isRetryableStatus } from '../errors';
import type { DescribeInput, ExtractInput, LLMProvider } from './types';

const API = 'https://generativelanguage.googleapis.com/v1beta/models';

type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

interface GenerateRequest {
  system: string;
  parts: GeminiPart[];
  temperature: number;
  timeoutMs: number;
  schema: Record<string, unknown>;
}

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
    const text = await this.generate({
      system: buildSystemPrompt(input.lang),
      parts: [
        { inlineData: { mimeType: 'image/jpeg', data: input.image.toString('base64') } },
        { text: buildUserPrompt(input.facts) },
      ],
      temperature: 0.8,
      timeoutMs: 120_000,
      schema: {
        type: 'OBJECT',
        properties: {
          description: { type: 'STRING' },
          suggestedTitle: { type: 'STRING' },
          uncertain: { type: 'ARRAY', items: { type: 'STRING' } },
        },
        required: ['description', 'suggestedTitle', 'uncertain'],
      },
    });
    return parseGeneratedDescription(text);
  }

  async extractPaintings(input: ExtractInput): Promise<ImportResult> {
    const parts: GeminiPart[] = [];
    if (input.file) {
      parts.push({ inlineData: { mimeType: input.file.mimeType, data: input.file.data.toString('base64') } });
    }
    parts.push({ text: buildImportUserPrompt(input) });
    const text = await this.generate({
      system: buildImportSystemPrompt(input.lang),
      parts,
      // Тут потрібна точність переписування, а не художність.
      temperature: 0.1,
      timeoutMs: 120_000,
      schema: {
        type: 'OBJECT',
        properties: {
          paintings: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                title: { type: 'STRING' },
                author: { type: 'STRING' },
                year: { type: 'STRING' },
                technique: { type: 'STRING' },
                context: { type: 'STRING' },
                imageIndex: { type: 'INTEGER', nullable: true },
              },
              required: ['title', 'author', 'year', 'technique', 'context', 'imageIndex'],
            },
          },
          notes: { type: 'ARRAY', items: { type: 'STRING' } },
        },
        required: ['paintings', 'notes'],
      },
    });
    return parseImportResult(text, input.imageCount);
  }

  /** Запит до основної моделі, а за перевантаження чи вичерпаної квоти — до резервної. */
  private async generate(req: GenerateRequest): Promise<string> {
    let lastError: unknown;
    for (const model of this.models) {
      try {
        return await this.generateWith(model, req);
      } catch (err) {
        lastError = err;
        // Помилку запиту (поганий ключ, відмова фільтра) інша модель не виправить.
        if (err instanceof ProviderError && !err.retryable) throw err;
      }
    }
    throw lastError;
  }

  private async generateWith(model: string, req: GenerateRequest): Promise<string> {
    let res: Response;
    try {
      res = await fetch(`${API}/${model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': this.apiKey },
        signal: AbortSignal.timeout(req.timeoutMs),
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: req.system }] },
          contents: [{ role: 'user', parts: req.parts }],
          generationConfig: {
            temperature: req.temperature,
            responseMimeType: 'application/json',
            responseSchema: req.schema,
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
    return text;
  }
}

/** Повідомлення про квоту в Gemini багаторядкові; власнику досить першого рядка. */
function firstLine(message: string | undefined): string | undefined {
  return message?.split('\n')[0]?.trim() || undefined;
}
