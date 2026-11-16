import type { Lang } from '@canvascast/core';
import { ProviderError, isRetryableStatus } from '../errors';
import type { TtsProvider, TtsResult } from './types';
import { pcmDurationSec, pcmToWav } from './wav';

const API = 'https://generativelanguage.googleapis.com/v1beta/models';

interface GeminiAudioResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> };
  }>;
  error?: { message?: string };
}

/** Gemini TTS: офіційний безкоштовний варіант тим самим ключем (малі денні ліміти). */
export class GeminiTts implements TtsProvider {
  readonly name: string;

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly voice = 'Sulafat',
  ) {
    this.name = `gemini-tts:${model}`;
  }

  async synthesize({ text, lang }: { text: string; lang: Lang }): Promise<TtsResult> {
    const style =
      lang === 'uk'
        ? 'Прочитай спокійно, тепло й виразно, як аудіогід у галереї:'
        : 'Read calmly, warmly and expressively, like a gallery audio guide:';
    const res = await fetch(`${API}/${this.model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': this.apiKey },
      signal: AbortSignal.timeout(180_000),
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${style}\n\n${text}` }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: this.voice } } },
        },
      }),
    });
    const data = (await res.json().catch(() => ({}))) as GeminiAudioResponse;
    if (!res.ok) {
      throw new ProviderError(
        `Gemini TTS ${res.status}: ${data.error?.message ?? res.statusText}`,
        isRetryableStatus(res.status),
      );
    }
    const inline = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
    if (!inline?.data) throw new ProviderError('Gemini TTS не повернула аудіо');

    // Відповідь — сирий PCM, частота вказана в mimeType: "audio/L16;codec=pcm;rate=24000".
    const rate = Number(/rate=(\d+)/.exec(inline.mimeType ?? '')?.[1] ?? 24000);
    const pcm = Buffer.from(inline.data, 'base64');
    return {
      audio: pcmToWav(pcm, rate),
      mime: 'audio/wav',
      ext: 'wav',
      durationSec: pcmDurationSec(pcm.length, rate),
    };
  }
}
