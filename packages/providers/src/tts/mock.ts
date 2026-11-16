import type { TtsProvider, TtsResult } from './types';
import { pcmToWav } from './wav';

/** Секунда тиші — для тестів і роботи без мережі. */
export class MockTts implements TtsProvider {
  readonly name = 'mock';

  async synthesize(): Promise<TtsResult> {
    const rate = 8000;
    return { audio: pcmToWav(Buffer.alloc(rate * 2), rate), mime: 'audio/wav', ext: 'wav', durationSec: 1 };
  }
}
