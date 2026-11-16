import { Queue, type ConnectionOptions } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from '@canvascast/core';

export const GENERATION_QUEUE = 'generation';

export interface GenerationJobData {
  /** id рядка GenerationJob у БД */
  jobId: string;
  descriptionId: string;
  type: 'full' | 'tts';
}

/** Скільки разів BullMQ пробує задачу, перш ніж визнати її проваленою. */
export const GENERATION_ATTEMPTS = 5;

export function createRedis(): Redis {
  // maxRetriesPerRequest: null — вимога BullMQ для блокуючих з'єднань воркера.
  return new Redis(env.redisUrl, { maxRetriesPerRequest: null });
}

/** З'єднання для веб-процесу: при недоступному Redis запит падає швидко, а не висить. */
function createFailFastRedis(): Redis {
  return new Redis(env.redisUrl, { maxRetriesPerRequest: 2 });
}

const g = globalThis as unknown as {
  __canvascastRedis?: Redis;
  __canvascastQueue?: Queue<GenerationJobData>;
};

/** Спільне з'єднання для черги та лімітів (одне на процес). */
export function redis(): Redis {
  g.__canvascastRedis ??= createFailFastRedis();
  return g.__canvascastRedis;
}

export function generationQueue(): Queue<GenerationJobData> {
  g.__canvascastQueue ??= new Queue<GenerationJobData>(GENERATION_QUEUE, {
    connection: redis() as unknown as ConnectionOptions,
    defaultJobOptions: {
      attempts: GENERATION_ATTEMPTS,
      // 20 с, 40 с, 80 с, 160 с: сплески навантаження в безкоштовних AI-провайдерів
      // минають за хвилини, а хвилинна квота встигає відновитися.
      backoff: { type: 'exponential', delay: 20_000 },
      removeOnComplete: { age: 3600, count: 1000 },
      removeOnFail: { age: 24 * 3600 },
    },
  });
  return g.__canvascastQueue;
}

export async function enqueueGeneration(data: GenerationJobData): Promise<void> {
  // jobId = id рядка в БД: повторне додавання тієї ж задачі не створить дубліката.
  await generationQueue().add(data.type, data, { jobId: data.jobId });
}

/**
 * Лічильник у фіксованому вікні. Повертає true, якщо запит дозволено.
 * Використовується проти зловживань за відсутності реєстрації.
 */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<boolean> {
  const bucket = Math.floor(Date.now() / 1000 / windowSec);
  const redisKey = `rl:${key}:${bucket}`;
  const count = await redis().incr(redisKey);
  if (count === 1) await redis().expire(redisKey, windowSec + 5);
  return count <= limit;
}
