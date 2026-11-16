import { createServer } from 'node:http';
import { UnrecoverableError, Worker, type ConnectionOptions } from 'bullmq';
import { env } from '@canvascast/core';
import { prisma } from '@canvascast/db';
import { ProviderError, createLLMProvider, createTtsProvider } from '@canvascast/providers';
import {
  GENERATION_ATTEMPTS,
  GENERATION_QUEUE,
  IDLE_FRIENDLY_WORKER_OPTIONS,
  createRedis,
  type GenerationJobData,
} from '@canvascast/queue';
import { processGeneration } from './process';

const providers = { llm: createLLMProvider(), tts: createTtsProvider() };

const worker = new Worker<GenerationJobData>(
  GENERATION_QUEUE,
  async (job) => {
    const data = job.data;
    const attempt = job.attemptsMade + 1;
    await prisma.generationJob
      .update({ where: { id: data.jobId }, data: { status: 'running', attempts: attempt } })
      .catch(() => {}); // рядок міг зникнути разом із видаленою картиною

    try {
      await processGeneration(data, providers);
      await prisma.generationJob
        .update({ where: { id: data.jobId }, data: { status: 'done', error: null, finishedAt: new Date() } })
        .catch(() => {});
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const retryable = !(err instanceof ProviderError) || err.retryable;
      const final = !retryable || attempt >= GENERATION_ATTEMPTS;
      console.error(`[worker] задача ${data.jobId} (спроба ${attempt}/${GENERATION_ATTEMPTS}): ${message}`);

      if (final) {
        // Остаточний провал показуємо власнику в редакторі; він може запустити генерацію знову.
        await prisma.description
          .update({ where: { id: data.descriptionId }, data: { status: 'failed', error: message.slice(0, 500) } })
          .catch(() => {});
        await prisma.generationJob
          .update({
            where: { id: data.jobId },
            data: { status: 'failed', error: message.slice(0, 500), finishedAt: new Date() },
          })
          .catch(() => {});
      }
      throw retryable ? err : new UnrecoverableError(message);
    }
  },
  {
    connection: createRedis() as unknown as ConnectionOptions,
    concurrency: 2,
    ...IDLE_FRIENDLY_WORKER_OPTIONS,
    // Безкоштовні тарифи провайдерів мають ліміт запитів на хвилину — не перевищуємо його.
    limiter: { max: env.generationsPerMinute, duration: 60_000 },
  },
);

worker.on('ready', () => {
  console.log(`[worker] готовий. LLM: ${providers.llm.name}, TTS: ${providers.tts.name}`);
  if (providers.llm.name === 'mock') {
    console.log('[worker] GEMINI_API_KEY не задано — описи будуть демонстраційними (mock).');
  }
});
worker.on('completed', (job) => console.log(`[worker] задача ${job.data.jobId} виконана`));
worker.on('error', (err) => console.error('[worker] помилка:', err.message));

// Хостинги на кшталт Render чекають HTTP-порт і присипляють сервіс без запитів.
// Веб-застосунок звертається сюди, коли ставить задачу, — це будить воркер.
const port = Number.parseInt(process.env.PORT ?? '', 10);
const health = Number.isFinite(port)
  ? createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
      res.end('ok');
    }).listen(port, () => console.log(`[worker] health-ендпоінт на порту ${port}`))
  : null;

async function shutdown() {
  console.log('[worker] зупинка…');
  health?.close();
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
