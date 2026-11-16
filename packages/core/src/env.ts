/** Читання змінних середовища в одному місці, з дефолтами для локальної розробки. */

function str(name: string, fallback = ''): string {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

function int(name: string, fallback: number): number {
  const n = Number.parseInt(str(name), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const env = {
  get redisUrl() { return str('REDIS_URL', 'redis://localhost:6380'); },
  get appUrl() { return str('APP_URL').replace(/\/+$/, ''); },

  get s3() {
    return {
      endpoint: str('S3_ENDPOINT', 'http://localhost:9100'),
      region: str('S3_REGION', 'us-east-1'),
      bucket: str('S3_BUCKET', 'canvascast'),
      accessKey: str('S3_ACCESS_KEY', 'canvascast'),
      secretKey: str('S3_SECRET_KEY', 'canvascast-secret'),
    };
  },

  get llmProvider() { return str('LLM_PROVIDER', 'auto'); },
  get geminiApiKey() { return str('GEMINI_API_KEY'); },
  get geminiModel() { return str('GEMINI_MODEL', 'gemini-flash-latest'); },
  /** Резервна модель на випадок перевантаження чи вичерпаної квоти основної. Порожньо = без резерву. */
  get geminiFallbackModel() { return process.env.GEMINI_FALLBACK_MODEL ?? 'gemini-flash-lite-latest'; },

  get ttsProvider() { return str('TTS_PROVIDER', 'edge'); },
  get ttsVoiceUk() { return str('TTS_VOICE_UK', 'uk-UA-PolinaNeural'); },
  get ttsVoiceEn() { return str('TTS_VOICE_EN', 'en-GB-SoniaNeural'); },
  get geminiTtsModel() { return str('GEMINI_TTS_MODEL', 'gemini-2.5-flash-preview-tts'); },

  /** Скільки задач генерації на хвилину бере воркер (безкоштовний Gemini: 5 запитів/хв). */
  get generationsPerMinute() { return int('GENERATIONS_PER_MINUTE', 4); },
  get maxUploadBytes() { return int('MAX_UPLOAD_MB', 15) * 1024 * 1024; },
  get maxPaintingsPerGallery() { return int('MAX_PAINTINGS_PER_GALLERY', 60); },
  get maxGenerationsPerGalleryPerDay() { return int('MAX_GENERATIONS_PER_GALLERY_PER_DAY', 150); },
};
