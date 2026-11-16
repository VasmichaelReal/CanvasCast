import type { Lang } from '@canvascast/core';

export interface TtsResult {
  audio: Buffer;
  mime: 'audio/mpeg' | 'audio/wav';
  ext: 'mp3' | 'wav';
  durationSec: number;
}

export interface TtsProvider {
  readonly name: string;
  synthesize(input: { text: string; lang: Lang }): Promise<TtsResult>;
}
