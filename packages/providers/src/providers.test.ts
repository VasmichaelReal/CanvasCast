import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeminiLLM, MockLLM, MockTts, ProviderError, createLLMProvider, createTtsProvider, pcmToWav } from './index';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('вибір LLM-провайдера', () => {
  it('auto без ключа → демо-заглушка, з ключем → Gemini', () => {
    vi.stubEnv('LLM_PROVIDER', 'auto');
    vi.stubEnv('GEMINI_API_KEY', '');
    expect(createLLMProvider().name).toBe('mock');

    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    vi.stubEnv('GEMINI_MODEL', 'gemini-flash-latest');
    vi.stubEnv('GEMINI_FALLBACK_MODEL', '');
    expect(createLLMProvider().name).toBe('gemini:gemini-flash-latest');

    vi.stubEnv('GEMINI_FALLBACK_MODEL', 'gemini-flash-lite-latest');
    expect(createLLMProvider().name).toBe('gemini:gemini-flash-latest→gemini-flash-lite-latest');
  });

  it('явний gemini без ключа — зрозуміла помилка, а не тихий mock', () => {
    vi.stubEnv('LLM_PROVIDER', 'gemini');
    vi.stubEnv('GEMINI_API_KEY', '');
    expect(() => createLLMProvider()).toThrow(ProviderError);
  });

  it('невідомий провайдер — помилка', () => {
    vi.stubEnv('LLM_PROVIDER', 'gpt-9');
    expect(() => createLLMProvider()).toThrow(/Невідомий/);
    vi.stubEnv('TTS_PROVIDER', 'robot');
    expect(() => createTtsProvider()).toThrow(/Невідомий/);
  });
});

describe('MockLLM', () => {
  it('чесно позначає текст як демонстраційний обома мовами', async () => {
    const llm = new MockLLM();
    const uk = await llm.describe({ image: Buffer.alloc(0), lang: 'uk', facts: { title: 'Соняшники' } });
    expect(uk.description).toContain('демонстраційний');
    expect(uk.description).toContain('Соняшники');
    expect(uk.uncertain.length).toBeGreaterThan(0);
    expect(uk.suggestedTitle).toBe(''); // назву власника не перезаписуємо

    const en = await llm.describe({ image: Buffer.alloc(0), lang: 'en', facts: {} });
    expect(en.description).toContain('demonstration');
    expect(en.suggestedTitle).not.toBe('');
  });
});

describe('GeminiLLM', () => {
  const input = { image: Buffer.from('jpeg'), lang: 'uk' as const, facts: { author: 'Марія Примаченко' } };
  const description = 'У центрі полотна — великий звір із добрими очима, довкола нього квіти.';

  function stubFetch(status: number, body: unknown) {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('надсилає зображення, факти власника й системний промпт; розбирає відповідь', async () => {
    const fetchMock = stubFetch(200, {
      candidates: [
        {
          content: {
            parts: [
              { text: 'міркування моделі', thought: true },
              { text: JSON.stringify({ description, suggestedTitle: 'Звір', uncertain: [] }) },
            ],
          },
        },
      ],
    });

    const result = await new GeminiLLM('KEY', 'gemini-flash-latest').describe(input);
    expect(result).toEqual({ description, suggestedTitle: 'Звір', uncertain: [] });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/models/gemini-flash-latest:generateContent');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('KEY');
    const body = JSON.parse(init.body as string);
    expect(body.systemInstruction.parts[0].text).toContain('тифлокоментатор');
    expect(body.contents[0].parts[0].inlineData.data).toBe(Buffer.from('jpeg').toString('base64'));
    expect(body.contents[0].parts[1].text).toContain('Автор: Марія Примаченко');
  });

  it('429 і 5xx можна повторити, 4xx — ні', async () => {
    stubFetch(429, { error: { message: 'quota' } });
    await expect(new GeminiLLM('K', 'm').describe(input)).rejects.toMatchObject({ retryable: true });

    stubFetch(400, { error: { message: 'API key not valid' } });
    await expect(new GeminiLLM('K', 'm').describe(input)).rejects.toMatchObject({
      retryable: false,
      message: expect.stringContaining('API key not valid'),
    });
  });

  it('перевантажена основна модель → той самий запит іде до резервної', async () => {
    const ok = { candidates: [{ content: { parts: [{ text: JSON.stringify({ description }) }] } }] };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'high demand' } }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(ok), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await new GeminiLLM('K', 'main', 'spare').describe(input);
    expect(result.description).toBe(description);
    expect(fetchMock.mock.calls.map((c) => String(c[0]).match(/models\/([^:]+)/)?.[1])).toEqual(['main', 'spare']);
  });

  it('поганий ключ резервна модель не виправить — до неї не звертаємось', async () => {
    const fetchMock = stubFetch(400, { error: { message: 'API key not valid' } });
    await expect(new GeminiLLM('K', 'main', 'spare').describe(input)).rejects.toMatchObject({ retryable: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('обидві моделі недоступні — помилка з повтором пізніше', async () => {
    stubFetch(503, { error: { message: 'high demand\nдругий рядок' } });
    await expect(new GeminiLLM('K', 'main', 'spare').describe(input)).rejects.toMatchObject({
      retryable: true,
      message: 'Gemini 503 (spare): high demand',
    });
  });

  it('відмова моделі через фільтр безпеки — без повторів', async () => {
    stubFetch(200, { promptFeedback: { blockReason: 'SAFETY' } });
    await expect(new GeminiLLM('K', 'm').describe(input)).rejects.toMatchObject({ retryable: false });
  });
});

describe('аудіо', () => {
  it('WAV-заголовок описує саме ті дані, що йдуть за ним', () => {
    const pcm = Buffer.alloc(48_000); // 1 с, 24 кГц, моно, 16 біт
    const wav = pcmToWav(pcm, 24_000);
    expect(wav.length).toBe(44 + pcm.length);
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
    expect(wav.readUInt32LE(4)).toBe(36 + pcm.length);
    expect(wav.readUInt32LE(24)).toBe(24_000); // частота
    expect(wav.readUInt32LE(28)).toBe(48_000); // байт за секунду
    expect(wav.readUInt32LE(40)).toBe(pcm.length);
  });

  it('MockTts повертає відтворюваний WAV', async () => {
    const result = await new MockTts().synthesize();
    expect(result.mime).toBe('audio/wav');
    expect(result.audio.toString('ascii', 0, 4)).toBe('RIFF');
  });
});
