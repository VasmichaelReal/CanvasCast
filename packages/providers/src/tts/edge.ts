import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import type { Lang } from '@canvascast/core';
import { ProviderError } from '../errors';
import type { TtsProvider, TtsResult } from './types';

const BITRATE = 48_000; // відповідає AUDIO_24KHZ_48KBITRATE_MONO_MP3

/**
 * Нейроголоси Microsoft Edge («Читати вголос»). Безкоштовно й без ключа, є якісні
 * українські голоси. Доступ неофіційний, тож для продакшну варто перейти на
 * платного провайдера — для цього достатньо іншої реалізації TtsProvider.
 */
export class EdgeTts implements TtsProvider {
  readonly name = 'edge';

  constructor(private readonly voices: Record<Lang, string>) {}

  async synthesize({ text, lang }: { text: string; lang: Lang }): Promise<TtsResult> {
    const tts = new MsEdgeTTS();
    try {
      await tts.setMetadata(this.voices[lang], OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      const { audioStream } = tts.toStream(text);
      const chunks: Buffer[] = [];
      for await (const chunk of audioStream) chunks.push(chunk as Buffer);
      const audio = Buffer.concat(chunks);
      if (audio.length < 1000) throw new ProviderError('Edge TTS повернув порожнє аудіо');
      return {
        audio,
        mime: 'audio/mpeg',
        ext: 'mp3',
        durationSec: Math.max(1, Math.round((audio.length * 8) / BITRATE)),
      };
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      throw new ProviderError(`Edge TTS: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      tts.close();
    }
  }
}
